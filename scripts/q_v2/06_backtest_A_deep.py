"""
Q v2.0 — A안 깊이 파기 (3-a/b/c/d 통합)

3-a 풀 정제:
    - 218 통합  vs  197 (KIS 추가 KOSDAQ 21 제외)  vs  176 (KOSPI only)
    - 추가 KOSDAQ 21종목의 개별 손익 측정
3-b 동시 N종목 보유:
    - N=1, 2, 3
    - 자본 1/N씩 분할, 시각별 상위 N개 시그널 잡기
3-c 손절 보호:
    - 매수 후 첫 K분(K=0/1/2/3) 손절 면제 — 반등 시작점 일시적 음봉 보호
3-d 시그널 변형 그리드:
    - lookback 3/5/7분, candle 임계 0.3/0.5%, 시간대 분리

BEST 파라미터를 단계별 누적 적용: 풀 → N → 손절 보호 → 변형
"""
from __future__ import annotations

import sys
import time
import warnings
import glob
import itertools
from pathlib import Path
from dataclasses import dataclass

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

MINUTE_DIR = Path(__file__).parent / "cache" / "minute"
UNIVERSE_CSV = Path(__file__).parent / "cache" / "universe.csv"
REPORT_DIR = Path(__file__).parent / "reports"
REPORT_DIR.mkdir(parents=True, exist_ok=True)

SLIPPAGE = 0.0005
BUY_FEE = 0.00015
SELL_FEE = 0.00015
TAX = 0.0018
INITIAL_CAPITAL = 5_000_000
TRADE_CAP = 10_000_000
ENTRY_START = "09:30"
ENTRY_END = "14:00"

# stock_universe에 원래 있던 코스닥 종목 코드 (197 풀 = KOSPI200 ∪ stock_universe)
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from scripts.core.supabase_client import supabase
from scripts.core.kospi200 import KOSPI200_CODES

_cfg = supabase.table("config").select("stock_universe").eq("id", 1).execute().data[0]
STOCK_UNIVERSE_TICKERS = {item["ticker"] for item in _cfg["stock_universe"]}
KOSPI200_TICKERS = {f"{c}.KS" for c in KOSPI200_CODES}


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


def precompute(data: dict[str, pd.DataFrame], lookback: int = 5) -> pd.DataFrame:
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


def simulate(data: dict, sig: pd.DataFrame,
             tp_pct: float, sl_pct: float, hold_min: int,
             n_concurrent: int = 1,
             sl_protect_min: int = 0) -> pd.DataFrame:
    """동시 n_concurrent 종목 보유. sl_protect_min: 매수 후 K분간 손절 면제."""
    if sig.empty:
        return pd.DataFrame()
    sig = sig.sort_values(["datetime", "prev_5m"])  # 시각별 강한 급락순 정렬

    capital_per_slot = INITIAL_CAPITAL / n_concurrent
    capital = INITIAL_CAPITAL
    slots: list[dict | None] = [None] * n_concurrent
    bought_today: dict = {}
    trades = []

    # 시각 순회
    ts_groups = sig.groupby(level=0, sort=True)
    for ts, group in ts_groups:
        # 이미 만료된 슬롯 정리
        for i, s in enumerate(slots):
            if s is None:
                continue
            if ts >= s["force_end_ts"]:
                # 만료 (force_end_ts 도달 시점) — 이미 청산되었어야 함, 안전망
                slots[i] = None

        # 빈 슬롯 수만큼 시각 후보에서 채움
        empties = [i for i, s in enumerate(slots) if s is None]
        if not empties:
            continue

        candidates = group  # 이 시각 후보들 (강한 급락 순으로 정렬됨)
        used = 0
        for _, row in candidates.iterrows():
            if used >= len(empties):
                break
            ticker = row["ticker"]
            d = row["date"]
            bset = bought_today.setdefault(d, set())
            if ticker in bset:
                continue
            if any(s is not None and s["ticker"] == ticker for s in slots):
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
            buy_fee_amt = buy_amount * BUY_FEE
            cash_used = buy_amount + buy_fee_amt

            tp_price = entry_price * (1 + tp_pct / 100)
            sl_price = entry_price * (1 - sl_pct / 100)
            end_idx = min(idx + 1 + hold_min, len(df_t) - 1)

            # 시뮬 진행 (분봉별 high/low 체크)
            exit_idx = exit_price_raw = exit_reason = None
            entry_idx = idx + 1
            for j in range(entry_idx, end_idx + 1):
                bar = df_t.iloc[j]
                if bar.name.date() != d:
                    exit_idx = j - 1
                    exit_price_raw = float(df_t.iloc[exit_idx]["close"])
                    exit_reason = "day_end"
                    break
                bars_since_entry = j - entry_idx  # 0이면 매수 분봉 자체
                low = float(bar["low"])
                high = float(bar["high"])
                sl_allowed = bars_since_entry >= sl_protect_min
                if sl_allowed and low <= sl_price:
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
            net_proceeds = sell_amount * (1 - SELL_FEE - TAX)
            profit = net_proceeds - cash_used

            trades.append({
                "ts": next_bar.name, "ticker": ticker,
                "entry_price": entry_price, "exit_price": exit_price,
                "shares": shares, "profit": profit,
                "ret_pct": profit / cash_used * 100,
                "reason": exit_reason,
                "prev_5m": float(row["prev_5m"]),
                "candle": float(row["candle"]),
            })
            bset.add(ticker)
            used += 1
            # 슬롯은 매매 즉시 끝나므로 다음 시각부터 빈슬롯
            slots[empties[used - 1]] = None  # 즉시 해제 (시뮬 단순화)

    return pd.DataFrame(trades)


def summarize(trades: pd.DataFrame, label: str) -> dict:
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


def get_pool(label: str) -> set[str]:
    df_uni = pd.read_csv(UNIVERSE_CSV)
    if label == "218_all":
        return set(df_uni["ticker"])
    if label == "176_kospi_only":
        return set(df_uni[df_uni["market"] == "KOSPI"]["ticker"])
    if label == "42_kosdaq_only":
        return set(df_uni[df_uni["market"] == "KOSDAQ"]["ticker"])
    if label == "197_su_kospi200":
        # 원래 197 풀: KOSPI200 + stock_universe (KIS 추가 KOSDAQ 빼고)
        allowed_tickers = set(df_uni["ticker"]) & (KOSPI200_TICKERS | STOCK_UNIVERSE_TICKERS)
        return allowed_tickers
    raise ValueError(label)


# ============ 3-a: 풀 정제 ============
def step_a():
    print("\n" + "=" * 60)
    print("3-a. 풀 정제 (A 시그널: prev_5m≤-2.5 + candle≥+0.3, tp+2/sl-1.5/30m)")
    print("=" * 60)
    rows = []
    for label in ["218_all", "197_su_kospi200", "176_kospi_only", "42_kosdaq_only"]:
        pool = get_pool(label)
        data = load_data(pool)
        sig_all = precompute(data, lookback=5)
        sig = sig_all[(sig_all["prev_5m"] <= -2.5) & (sig_all["candle"] >= 0.3)].copy()
        trades = simulate(data, sig, tp_pct=2.0, sl_pct=1.5, hold_min=30,
                          n_concurrent=1, sl_protect_min=0)
        rows.append({**summarize(trades, f"{label} ({len(pool)})")})
    df = pd.DataFrame(rows)
    print(df.to_string(index=False))
    df.to_csv(REPORT_DIR / "step_3a_pool.csv", index=False)
    # BEST 풀 선택
    best_label = df.sort_values("total%", ascending=False).iloc[0]["label"].split(" ")[0]
    print(f"\n[3-a] BEST 풀: {best_label}")
    return best_label


# ============ 3-b: 동시 N종목 보유 ============
def step_b(pool_label: str):
    print("\n" + "=" * 60)
    print(f"3-b. 동시 N종목 보유 (풀: {pool_label})")
    print("=" * 60)
    pool = get_pool(pool_label)
    data = load_data(pool)
    sig_all = precompute(data, lookback=5)
    sig = sig_all[(sig_all["prev_5m"] <= -2.5) & (sig_all["candle"] >= 0.3)].copy()
    rows = []
    for n in [1, 2, 3]:
        trades = simulate(data, sig, tp_pct=2.0, sl_pct=1.5, hold_min=30,
                          n_concurrent=n, sl_protect_min=0)
        rows.append({**summarize(trades, f"N={n}")})
    df = pd.DataFrame(rows)
    print(df.to_string(index=False))
    df.to_csv(REPORT_DIR / "step_3b_concurrent.csv", index=False)
    best_n = int(df.sort_values("total%", ascending=False).iloc[0]["label"].split("=")[1])
    print(f"\n[3-b] BEST N: {best_n}")
    return best_n


# ============ 3-c: 손절 보호 ============
def step_c(pool_label: str, n: int):
    print("\n" + "=" * 60)
    print(f"3-c. 손절 보호 K분 (풀: {pool_label}, N={n})")
    print("=" * 60)
    pool = get_pool(pool_label)
    data = load_data(pool)
    sig_all = precompute(data, lookback=5)
    sig = sig_all[(sig_all["prev_5m"] <= -2.5) & (sig_all["candle"] >= 0.3)].copy()
    rows = []
    for k in [0, 1, 2, 3]:
        trades = simulate(data, sig, tp_pct=2.0, sl_pct=1.5, hold_min=30,
                          n_concurrent=n, sl_protect_min=k)
        rows.append({**summarize(trades, f"K={k}분")})
    df = pd.DataFrame(rows)
    print(df.to_string(index=False))
    df.to_csv(REPORT_DIR / "step_3c_slprotect.csv", index=False)
    best_k = int(df.sort_values("total%", ascending=False).iloc[0]["label"].split("=")[1].replace("분", ""))
    print(f"\n[3-c] BEST K: {best_k}분")
    return best_k


# ============ 3-d: 시그널 변형 그리드 ============
def step_d(pool_label: str, n: int, k: int):
    print("\n" + "=" * 60)
    print(f"3-d. 시그널 변형 그리드 (풀: {pool_label}, N={n}, K={k}분 손절보호)")
    print("=" * 60)
    pool = get_pool(pool_label)
    data = load_data(pool)

    rows = []
    # lookback 변형
    for lb in [3, 5, 7, 10]:
        sig_all = precompute(data, lookback=lb)
        for entry in [2.0, 2.5, 3.0]:
            for candle in [0.3, 0.5]:
                sig = sig_all[(sig_all["prev_5m"] <= -entry) &
                              (sig_all["candle"] >= candle)].copy()
                trades = simulate(data, sig, tp_pct=2.0, sl_pct=1.5, hold_min=30,
                                  n_concurrent=n, sl_protect_min=k)
                s = summarize(trades, f"lb{lb} e{entry} c{candle}")
                rows.append({
                    "lookback": lb, "entry": entry, "candle": candle,
                    **{k: v for k, v in s.items() if k != "label"}
                })
    df = pd.DataFrame(rows).sort_values("total%", ascending=False)
    df.to_csv(REPORT_DIR / "step_3d_signal_variants.csv", index=False)
    print("--- TOP 10 ---")
    print(df.head(10).to_string(index=False))

    # 시간대 효과 (best 변형 고정)
    best = df.iloc[0]
    print(f"\n[3-d] BEST: lookback={best['lookback']} entry={best['entry']} candle={best['candle']}")
    print("\n--- 시간대 효과 (BEST 변형 기준) ---")
    sig_all = precompute(data, lookback=int(best["lookback"]))
    sig_b = sig_all[(sig_all["prev_5m"] <= -best["entry"]) &
                    (sig_all["candle"] >= best["candle"])].copy()
    rows_t = []
    for hm_min, hm_max, label in [
        ("09:30", "11:00", "오전(09:30~11:00)"),
        ("11:00", "13:00", "중반(11:00~13:00)"),
        ("13:00", "14:00", "오후(13:00~14:00)"),
    ]:
        sig_t = sig_b[(sig_b["hm"] >= hm_min) & (sig_b["hm"] <= hm_max)].copy()
        trades = simulate(data, sig_t, tp_pct=2.0, sl_pct=1.5, hold_min=30,
                          n_concurrent=n, sl_protect_min=k)
        rows_t.append({**summarize(trades, label)})
    print(pd.DataFrame(rows_t).to_string(index=False))
    return best


def main():
    print(f"stock_universe 종목 수: {len(STOCK_UNIVERSE_TICKERS)}")
    best_pool = step_a()
    best_n = step_b(best_pool)
    best_k = step_c(best_pool, best_n)
    best_sig = step_d(best_pool, best_n, best_k)

    print("\n" + "=" * 60)
    print("최종 누적 BEST 조합")
    print("=" * 60)
    print(f"  풀: {best_pool}")
    print(f"  동시 보유: {best_n}종목")
    print(f"  손절 보호: 매수 후 {best_k}분")
    print(f"  시그널: prev_{int(best_sig['lookback'])}m ≤ -{best_sig['entry']}%, candle ≥ +{best_sig['candle']}%")


if __name__ == "__main__":
    main()
