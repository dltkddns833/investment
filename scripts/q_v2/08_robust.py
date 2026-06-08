"""
Q v2.0 — Robust zone 분석 + 단순 룰 OOS 재검증

(가) Robust zone:
    학습 TOP 30~50의 검증 평균 성과. 단일 BEST가 아닌 zone으로 평가.
    파라미터 영역별로 검증 흑자율/평균 total% 확인.

(나) n≥20 필터:
    학습에서 표본 충분한 조합(n≥20)만 후보 → 검증

(다) 룰 단순화 (그리드 없이):
    entry≤-2.5%, candle>0, tp/sl 대칭 1.5%, 30m, 전 시간대(09:30~14:00)
    학습/검증 분리해서 평가
"""
from __future__ import annotations

import sys
import time
import warnings
import glob
import itertools
from pathlib import Path
from datetime import date

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from scripts.core.supabase_client import supabase
from scripts.core.kospi200 import KOSPI200_CODES

MINUTE_DIR = Path(__file__).parent / "cache" / "minute"
UNIVERSE_CSV = Path(__file__).parent / "cache" / "universe.csv"
REPORT_DIR = Path(__file__).parent / "reports"

_cfg = supabase.table("config").select("stock_universe").eq("id", 1).execute().data[0]
STOCK_UNIVERSE_TICKERS = {item["ticker"] for item in _cfg["stock_universe"]}
KOSPI200_TICKERS = {f"{c}.KS" for c in KOSPI200_CODES}

SLIPPAGE = 0.0005
BUY_FEE = 0.00015
SELL_FEE = 0.00015
TAX = 0.0018
INITIAL_CAPITAL = 5_000_000
TRADE_CAP = 10_000_000

SPLIT_DATE = date(2026, 5, 11)


def get_pool_197() -> set[str]:
    df_uni = pd.read_csv(UNIVERSE_CSV)
    return set(df_uni["ticker"]) & (KOSPI200_TICKERS | STOCK_UNIVERSE_TICKERS)


def load_data(tickers: set[str]) -> dict[str, pd.DataFrame]:
    out = {}
    for f in sorted(glob.glob(str(MINUTE_DIR / "*.pkl"))):
        t = Path(f).stem
        if t not in tickers:
            continue
        df = pd.read_pickle(f).copy()
        df["date"] = df.index.date
        df["hm"] = df.index.strftime("%H:%M")
        out[t] = df
    return out


def precompute(data, lookback: int, hm_start: str, hm_end: str) -> pd.DataFrame:
    """prev_5m·candle 사전계산.

    영업일 경계 처리: prev_5m은 **같은 날 내**에서만 계산. 종목별로 date.groupby
    후 shift(lookback) → 전일 마지막 close 참조로 인한 갭다운 가짜 시그널 차단.
    영업일 첫 lookback 분봉(09:00~09:04)은 prev_5m이 NaN.
    """
    parts = []
    for t, df in data.items():
        d = df.copy()
        d["prev_5m"] = d.groupby("date")["close"].transform(
            lambda s: (s / s.shift(lookback) - 1) * 100
        )
        d["candle"] = (d["close"] - d["open"]) / d["open"] * 100
        d["ticker"] = t
        d = d[(d["hm"] >= hm_start) & (d["hm"] <= hm_end)]
        d = d.dropna(subset=["prev_5m"])
        parts.append(d[["ticker", "date", "hm", "open", "high", "low", "close",
                        "prev_5m", "candle"]])
    out = pd.concat(parts)
    out.index.name = "datetime"
    return out


def simulate(data, sig, tp_pct, sl_pct, hold_min, n_concurrent=1):
    if sig.empty:
        return pd.DataFrame()
    sig = sig.sort_values(["datetime", "prev_5m"])
    slots = [None] * n_concurrent
    capital_per_slot = INITIAL_CAPITAL / n_concurrent
    bought_today: dict = {}
    trades = []
    for ts, group in sig.groupby(level=0, sort=True):
        empties = [i for i, s in enumerate(slots) if s is None]
        if not empties:
            continue
        used = 0
        for _, row in group.iterrows():
            if used >= len(empties):
                break
            ticker = row["ticker"]
            d = row["date"]
            bset = bought_today.setdefault(d, set())
            if ticker in bset:
                continue
            df_t = data[ticker]
            idx = df_t.index.get_indexer([ts])[0]
            if idx < 0 or idx + 1 >= len(df_t):
                continue
            next_bar = df_t.iloc[idx + 1]
            if next_bar.name.date() != d:
                continue
            entry_raw = float(next_bar["open"])
            if entry_raw <= 0:
                continue
            entry_price = entry_raw * (1 + SLIPPAGE)
            invest = min(capital_per_slot, TRADE_CAP)
            shares = int(invest // entry_price)
            if shares <= 0:
                continue
            buy_amount = shares * entry_price
            cash_used = buy_amount + buy_amount * BUY_FEE
            tp_price = entry_price * (1 + tp_pct / 100)
            sl_price = entry_price * (1 - sl_pct / 100)
            end_idx = min(idx + 1 + hold_min, len(df_t) - 1)
            exit_idx = exit_price_raw = exit_reason = None
            for j in range(idx + 1, end_idx + 1):
                bar = df_t.iloc[j]
                if bar.name.date() != d:
                    exit_idx = j - 1
                    exit_price_raw = float(df_t.iloc[exit_idx]["close"])
                    exit_reason = "day_end"
                    break
                low, high = float(bar["low"]), float(bar["high"])
                if low <= sl_price:
                    exit_idx, exit_price_raw, exit_reason = j, sl_price, "stop_loss"
                    break
                if high >= tp_price:
                    exit_idx, exit_price_raw, exit_reason = j, tp_price, "take_profit"
                    break
                if j == end_idx:
                    exit_idx, exit_price_raw, exit_reason = j, float(bar["close"]), "time_exit"
            if exit_idx is None:
                continue
            exit_price = exit_price_raw * (1 - SLIPPAGE)
            sell_amount = shares * exit_price
            net = sell_amount * (1 - SELL_FEE - TAX)
            profit = net - cash_used
            trades.append({
                "ts": next_bar.name, "ticker": ticker, "date": d,
                "profit": profit, "ret_pct": profit / cash_used * 100,
                "reason": exit_reason,
            })
            bset.add(ticker)
            used += 1
    return pd.DataFrame(trades)


def summarize(trades, label=""):
    if trades is None or trades.empty:
        return {"label": label, "n": 0, "win%": 0.0, "exp%": 0.0, "total%": 0.0,
                "mdd%": 0.0, "tp": 0, "sl": 0, "time": 0}
    wins = trades[trades["profit"] > 0]
    eq = INITIAL_CAPITAL + trades["profit"].cumsum()
    peak = eq.cummax()
    dd = (eq - peak) / peak * 100
    by_r = trades.groupby("reason").size().to_dict()
    return {
        "label": label, "n": len(trades),
        "win%": round(len(wins) / len(trades) * 100, 1),
        "exp%": round(trades["ret_pct"].mean(), 3),
        "total%": round(trades["profit"].sum() / INITIAL_CAPITAL * 100, 2),
        "mdd%": round(float(dd.min()), 2),
        "tp": by_r.get("take_profit", 0),
        "sl": by_r.get("stop_loss", 0),
        "time": by_r.get("time_exit", 0),
    }


def step_robust(data, hm_start, hm_end):
    """학습/검증 분리. 학습 그리드 + 검증 평가. n≥20 필터 포함."""
    print("\n" + "=" * 60)
    print(f"(가)+(나) Robust zone + n≥20 — 시간대 {hm_start}~{hm_end}")
    print("=" * 60)
    sig_all = precompute(data, lookback=5, hm_start=hm_start, hm_end=hm_end)
    sig_train = sig_all[sig_all["date"] < SPLIT_DATE].copy()
    sig_test = sig_all[sig_all["date"] >= SPLIT_DATE].copy()

    grid_entry = [1.5, 2.0, 2.5, 3.0]
    grid_candle = [0.0, 0.3, 0.5]
    grid_tp = [1.0, 1.5, 2.0, 2.5]
    grid_sl = [1.0, 1.5, 2.0]
    grid_hold = [15, 30, 60]
    combos = list(itertools.product(grid_entry, grid_candle, grid_tp, grid_sl, grid_hold))

    rows = []
    for (e, c, tp, sl, h) in combos:
        sub_tr = sig_train[(sig_train["prev_5m"] <= -e) & (sig_train["candle"] >= c)]
        sub_te = sig_test[(sig_test["prev_5m"] <= -e) & (sig_test["candle"] >= c)]
        tr_trades = simulate(data, sub_tr, tp, sl, h, 1)
        te_trades = simulate(data, sub_te, tp, sl, h, 1)
        s_tr = summarize(tr_trades, "train")
        s_te = summarize(te_trades, "test")
        rows.append({
            "entry": e, "candle": c, "tp": tp, "sl": sl, "hold": h,
            "tr_n": s_tr["n"], "tr_win%": s_tr["win%"], "tr_total%": s_tr["total%"],
            "te_n": s_te["n"], "te_win%": s_te["win%"], "te_total%": s_te["total%"], "te_mdd%": s_te["mdd%"],
        })
    df = pd.DataFrame(rows)
    df.to_csv(REPORT_DIR / f"robust_{hm_start.replace(':','')}_{hm_end.replace(':','')}.csv", index=False)

    # 학습 흑자 zone의 검증 결과
    train_pos = df[df["tr_total%"] > 0]
    print(f"\n학습 흑자 조합: {len(train_pos)}/{len(df)} ({len(train_pos)/len(df)*100:.0f}%)")
    if len(train_pos) > 0:
        print(f"  학습 흑자 → 검증 평균: total%={train_pos['te_total%'].mean():.2f} / 흑자율={(train_pos['te_total%']>0).mean()*100:.1f}%")

    # n≥20 (학습) 필터
    train_n20 = df[df["tr_n"] >= 20]
    print(f"\n학습 n≥20: {len(train_n20)}조합")
    if len(train_n20) > 0:
        # 학습 total% 기준 TOP 10
        top10 = train_n20.sort_values("tr_total%", ascending=False).head(10)
        print("\n--- 학습 n≥20 TOP 10 ---")
        print(top10.to_string(index=False))
        print(f"\nTOP 10 검증 평균: total%={top10['te_total%'].mean():.2f} / 흑자율={(top10['te_total%']>0).mean()*100:.0f}%")

        top30 = train_n20.sort_values("tr_total%", ascending=False).head(30)
        print(f"TOP 30 검증 평균: total%={top30['te_total%'].mean():.2f} / 흑자율={(top30['te_total%']>0).mean()*100:.0f}%")

    # 학습+검증 모두 흑자인 robust 조합
    both_pos = df[(df["tr_total%"] > 0) & (df["te_total%"] > 0) & (df["tr_n"] >= 10) & (df["te_n"] >= 5)]
    print(f"\n--- 양쪽 흑자 + 학습 n≥10 + 검증 n≥5 robust 조합: {len(both_pos)}개 ---")
    if len(both_pos) > 0:
        print(both_pos.sort_values("te_total%", ascending=False).head(15).to_string(index=False))

    return df


def step_simple_rule(data, hm_start, hm_end):
    """단순 직관 룰들을 학습/검증 모두에서 평가."""
    print("\n" + "=" * 60)
    print(f"(다) 단순 룰 OOS 평가 — 시간대 {hm_start}~{hm_end}")
    print("=" * 60)
    sig_all = precompute(data, lookback=5, hm_start=hm_start, hm_end=hm_end)
    sig_train = sig_all[sig_all["date"] < SPLIT_DATE].copy()
    sig_test = sig_all[sig_all["date"] >= SPLIT_DATE].copy()

    rules = [
        ("기본",        -2.5, 0.0, 1.5, 1.5, 30),
        ("타이트 양봉",   -2.5, 0.3, 1.5, 1.5, 30),
        ("강한 급락",    -3.0, 0.0, 1.5, 1.5, 30),
        ("익절 큼",     -2.5, 0.0, 2.0, 1.5, 30),
        ("손절 타이트",  -2.5, 0.0, 1.5, 1.0, 30),
        ("보유 짧음",    -2.5, 0.0, 1.5, 1.5, 15),
        ("대칭 1%",     -2.0, 0.0, 1.0, 1.0, 30),
        ("대칭 2%",     -2.5, 0.0, 2.0, 2.0, 60),
        ("작은 급락",    -1.5, 0.3, 1.5, 1.5, 30),
    ]
    rows = []
    for (name, e, c, tp, sl, h) in rules:
        sub_tr = sig_train[(sig_train["prev_5m"] <= e) & (sig_train["candle"] >= c)]
        sub_te = sig_test[(sig_test["prev_5m"] <= e) & (sig_test["candle"] >= c)]
        tr = simulate(data, sub_tr, tp, sl, h, 1)
        te = simulate(data, sub_te, tp, sl, h, 1)
        full = pd.concat([tr, te]) if not tr.empty and not te.empty else (tr if not tr.empty else te)
        s_tr = summarize(tr); s_te = summarize(te); s_all = summarize(full)
        rows.append({
            "rule": name, "entry": e, "candle": c, "tp": tp, "sl": sl, "h": h,
            "tr_n": s_tr["n"], "tr_win%": s_tr["win%"], "tr_total%": s_tr["total%"],
            "te_n": s_te["n"], "te_win%": s_te["win%"], "te_total%": s_te["total%"],
            "all_n": s_all["n"], "all_win%": s_all["win%"], "all_total%": s_all["total%"],
            "all_mdd%": s_all["mdd%"],
        })
    df = pd.DataFrame(rows)
    print(df.to_string(index=False))
    df.to_csv(REPORT_DIR / f"simple_rules_{hm_start.replace(':','')}_{hm_end.replace(':','')}.csv", index=False)
    return df


def main():
    pool = get_pool_197()
    data = load_data(pool)
    print(f"풀 {len(pool)}종목 / 학습 < {SPLIT_DATE} / 검증 >= {SPLIT_DATE}")

    # 시간대별로 두 번 평가: 오전 only (이전 best) / 전 시간대
    for hm_start, hm_end in [("09:30", "11:00"), ("09:30", "14:00")]:
        step_robust(data, hm_start, hm_end)
        step_simple_rule(data, hm_start, hm_end)


if __name__ == "__main__":
    main()
