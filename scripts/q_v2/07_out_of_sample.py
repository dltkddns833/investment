"""
Q v2.0 — Out-of-sample 검증

데이터 18영업일을 시간 순으로 분할:
  학습 구간: 4/21 ~ 5/8 (12 영업일)
  검증 구간: 5/11 ~ 5/18 (6 영업일)

절차:
  1. 학습 구간에서 그리드 서치로 BEST 파라미터 선정 (시간대 09:30~11:00 고정)
  2. 그 BEST 파라미터를 검증 구간에 적용
  3. 학습 / 검증 결과 비교 → 과최적화 여부 판정

판정 기준:
  - 검증 total% > 0 AND 검증 승률 ≥ 학습의 80% → 룰 신뢰 가능
  - 검증 total% < 0 OR 승률 급락 → 과최적화 → 룰 재조정 필요
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
ENTRY_START = "09:30"
ENTRY_END = "11:00"   # 3-d에서 도출된 best 시간대

SPLIT_DATE = date(2026, 5, 11)  # 5/11 이상 → 검증


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


def precompute(data, lookback: int = 5) -> pd.DataFrame:
    parts = []
    for t, df in data.items():
        d = df.copy()
        d["prev_5m"] = (d["close"] / d["close"].shift(lookback) - 1) * 100
        d["candle"] = (d["close"] - d["open"]) / d["open"] * 100
        d["ticker"] = t
        d = d[(d["hm"] >= ENTRY_START) & (d["hm"] <= ENTRY_END)]
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


def summarize(trades, label):
    if trades is None or trades.empty:
        return {"label": label, "n": 0, "win%": 0, "exp%": 0, "total%": 0,
                "mdd%": 0, "tp": 0, "sl": 0, "time": 0}
    wins = trades[trades["profit"] > 0]
    eq = INITIAL_CAPITAL + trades["profit"].cumsum()
    peak = eq.cummax()
    dd = (eq - peak) / peak * 100
    by_r = trades.groupby("reason").size().to_dict()
    return {
        "label": label,
        "n": len(trades),
        "win%": round(len(wins) / len(trades) * 100, 1),
        "exp%": round(trades["ret_pct"].mean(), 3),
        "total%": round(trades["profit"].sum() / INITIAL_CAPITAL * 100, 2),
        "mdd%": round(float(dd.min()), 2),
        "tp": by_r.get("take_profit", 0),
        "sl": by_r.get("stop_loss", 0),
        "time": by_r.get("time_exit", 0),
    }


def main():
    pool = get_pool_197()
    data = load_data(pool)
    print(f"[oos] 풀 {len(pool)}종목 로드 / 시간대 {ENTRY_START}~{ENTRY_END}")

    sig_all = precompute(data, lookback=5)
    # 학습 / 검증 분할
    sig_train = sig_all[sig_all["date"] < SPLIT_DATE].copy()
    sig_test = sig_all[sig_all["date"] >= SPLIT_DATE].copy()
    train_days = sorted(set(sig_train["date"]))
    test_days = sorted(set(sig_test["date"]))
    print(f"[oos] 학습 영업일 {len(train_days)}일: {train_days[0]} ~ {train_days[-1]}")
    print(f"[oos] 검증 영업일 {len(test_days)}일: {test_days[0]} ~ {test_days[-1]}")

    # 학습 구간에서 그리드 서치
    grid_entry = [2.0, 2.5, 3.0]
    grid_candle = [0.3, 0.5, 0.7]
    grid_tp = [1.5, 2.0, 2.5]
    grid_sl = [1.0, 1.5, 2.0]
    grid_hold = [15, 30, 60]
    combos = list(itertools.product(grid_entry, grid_candle, grid_tp, grid_sl, grid_hold))
    print(f"\n[oos] 학습 그리드 {len(combos)}조합 탐색...")
    rows = []
    t0 = time.time()
    for i, (e, c, tp, sl, h) in enumerate(combos, 1):
        sig = sig_train[(sig_train["prev_5m"] <= -e) & (sig_train["candle"] >= c)].copy()
        trades = simulate(data, sig, tp_pct=tp, sl_pct=sl, hold_min=h, n_concurrent=1)
        s = summarize(trades, "")
        rows.append({
            "entry": e, "candle": c, "tp": tp, "sl": sl, "hold": h,
            "n": s["n"], "win%": s["win%"], "exp%": s["exp%"],
            "total%": s["total%"], "mdd%": s["mdd%"],
        })
        if i % 30 == 0:
            print(f"  {i}/{len(combos)} ({time.time()-t0:.1f}s)")
    df_train = pd.DataFrame(rows).sort_values("total%", ascending=False)
    df_train.to_csv(REPORT_DIR / "oos_train_grid.csv", index=False)
    print("\n--- 학습 구간 TOP 10 ---")
    print(df_train.head(10).to_string(index=False))

    # 학습 BEST 파라미터로 검증 구간 평가
    best = df_train.iloc[0]
    print(f"\n[oos] 학습 BEST: entry≤-{best['entry']}, candle≥+{best['candle']}, "
          f"tp+{best['tp']}/sl-{best['sl']}/hold{int(best['hold'])}m")

    sig_t = sig_test[(sig_test["prev_5m"] <= -best["entry"]) &
                     (sig_test["candle"] >= best["candle"])].copy()
    trades_test = simulate(data, sig_t,
                           tp_pct=float(best["tp"]), sl_pct=float(best["sl"]),
                           hold_min=int(best["hold"]), n_concurrent=1)
    s_test = summarize(trades_test, "검증")
    s_train = summarize(simulate(data,
                                 sig_train[(sig_train["prev_5m"] <= -best["entry"]) &
                                           (sig_train["candle"] >= best["candle"])],
                                 tp_pct=float(best["tp"]), sl_pct=float(best["sl"]),
                                 hold_min=int(best["hold"]), n_concurrent=1),
                        "학습")

    print("\n=== 학습 vs 검증 비교 (BEST 파라미터) ===")
    print(pd.DataFrame([s_train, s_test]).to_string(index=False))

    # TOP 5 파라미터 각각 검증
    print("\n=== 학습 TOP 5 파라미터 각각의 검증 성과 ===")
    rows_v = []
    for _, row in df_train.head(5).iterrows():
        sig_t = sig_test[(sig_test["prev_5m"] <= -row["entry"]) &
                         (sig_test["candle"] >= row["candle"])].copy()
        t_test = simulate(data, sig_t,
                          tp_pct=float(row["tp"]), sl_pct=float(row["sl"]),
                          hold_min=int(row["hold"]), n_concurrent=1)
        s = summarize(t_test, f"e{row['entry']} c{row['candle']} tp{row['tp']} sl{row['sl']} h{int(row['hold'])}")
        rows_v.append({
            "entry": row["entry"], "candle": row["candle"],
            "tp": row["tp"], "sl": row["sl"], "hold": int(row["hold"]),
            "train_n": row["n"], "train_win%": row["win%"], "train_total%": row["total%"],
            "test_n": s["n"], "test_win%": s["win%"], "test_total%": s["total%"], "test_mdd%": s["mdd%"],
        })
    df_v = pd.DataFrame(rows_v)
    print(df_v.to_string(index=False))
    df_v.to_csv(REPORT_DIR / "oos_top5_train_vs_test.csv", index=False)

    # 판정
    print("\n=== 판정 ===")
    if s_test["n"] == 0:
        print("⚠️ 검증 구간 거래 0건 → 시그널 빈도 부족, 룰 재조정 필요")
    elif s_test["total%"] > 0 and s_test["win%"] >= s_train["win%"] * 0.8:
        print("✅ 검증 흑자 + 승률 유지 → 룰 신뢰 가능")
    elif s_test["total%"] > 0:
        print("⚠️ 검증 흑자나 승률 하락 → 부분 과최적화 의심")
    else:
        print("❌ 검증 적자 → 과최적화 강하게 의심, 룰 재조정 필요")


if __name__ == "__main__":
    main()
