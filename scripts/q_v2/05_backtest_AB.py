"""
Q v2.0 — A안 시장 분리 진단 + B안 (vol+양봉 타이트) 백테스트

A안: 급락 반등
  prev_5m <= -ENTRY_PCT AND candle >= MIN_CANDLE_PCT
  → KOSPI / KOSDAQ / 전체 분리 결과 비교

B안: vol 폭증 + 양봉 + 등락률 타이트
  vol_ratio >= VOL_RATIO AND candle > 0 AND DAY_MIN <= day_pct <= DAY_MAX
  → 그리드 서치

진입/청산/비용은 A안과 동일 (04_backtest_A.py와 같은 엔진).
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


def load_all(market: str | None = None) -> dict[str, pd.DataFrame]:
    df_uni = pd.read_csv(UNIVERSE_CSV)
    if market:
        df_uni = df_uni[df_uni["market"] == market]
    allowed = set(df_uni["ticker"])
    out = {}
    for f in sorted(glob.glob(str(MINUTE_DIR / "*.pkl"))):
        t = Path(f).stem
        if t not in allowed:
            continue
        df = pd.read_pickle(f)
        df = df.copy()
        df["date"] = df.index.date
        df["hm"] = df.index.strftime("%H:%M")
        out[t] = df
    return out


def precompute_signals(data: dict[str, pd.DataFrame]) -> pd.DataFrame:
    parts = []
    for t, df in data.items():
        d = df.copy()
        d["prev_5m"] = (d["close"] / d["close"].shift(5) - 1) * 100
        d["candle"] = (d["close"] - d["open"]) / d["open"] * 100
        d["vol_5ma"] = d["volume"].rolling(5).mean().shift(1)
        d["vol_ratio"] = d["volume"] / d["vol_5ma"].replace(0, np.nan)
        day_open = d.groupby("date")["open"].transform("first")
        d["day_pct"] = (d["open"] / day_open - 1) * 100
        d["ticker"] = t
        d = d[(d["hm"] >= ENTRY_START) & (d["hm"] <= ENTRY_END)]
        parts.append(d[["ticker", "date", "hm", "open", "high", "low", "close",
                        "prev_5m", "candle", "vol_ratio", "day_pct"]])
    out = pd.concat(parts)
    out.index.name = "datetime"
    return out


def run_simulation(data, sig: pd.DataFrame, rank_col: str, ascending: bool = True):
    """공통 시뮬레이션. sig는 이미 시그널 필터링된 분봉, rank_col로 시각별 종목 1개 선택."""
    if sig.empty:
        return None
    sig = sig.sort_values(["datetime", rank_col], ascending=[True, ascending])
    sig = sig.groupby(sig.index).first()

    capital = INITIAL_CAPITAL
    holding = None
    bought_today: dict = {}
    trades = []

    for ts, row in sig.iterrows():
        if holding is not None:
            continue
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
        invest = min(capital, TRADE_CAP)
        shares = int(invest // entry_price)
        if shares <= 0:
            continue
        buy_amount = shares * entry_price
        buy_fee_amt = buy_amount * BUY_FEE
        cash_used = buy_amount + buy_fee_amt
        if cash_used > capital:
            shares -= 1
            if shares <= 0:
                continue
            buy_amount = shares * entry_price
            buy_fee_amt = buy_amount * BUY_FEE
            cash_used = buy_amount + buy_fee_amt

        tp_price = entry_price * (1 + row["tp_pct"] / 100)
        sl_price = entry_price * (1 - row["sl_pct"] / 100)
        end_idx = min(idx + 1 + int(row["hold_min"]), len(df_t) - 1)

        exit_idx = exit_price_raw = exit_reason = None
        for j in range(idx + 1, end_idx + 1):
            bar = df_t.iloc[j]
            if bar.name.date() != d:
                exit_idx = j - 1
                exit_price_raw = float(df_t.iloc[exit_idx]["close"])
                exit_reason = "day_end"
                break
            low = float(bar["low"])
            high = float(bar["high"])
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
        net_proceeds = sell_amount * (1 - SELL_FEE - TAX)
        profit = net_proceeds - cash_used
        capital += profit
        trades.append({
            "ts": next_bar.name, "ticker": ticker,
            "entry_price": entry_price, "exit_price": exit_price,
            "profit": profit, "ret_pct": profit / cash_used * 100,
            "reason": exit_reason,
        })
        bset.add(ticker)
        holding = None

    return pd.DataFrame(trades)


def summarize(trades: pd.DataFrame, label: str) -> dict:
    if trades is None or trades.empty:
        return {"label": label, "n": 0, "total_pct": 0, "win_rate": 0,
                "exp_pct": 0, "mdd_pct": 0, "tp_n": 0, "sl_n": 0, "time_n": 0}
    wins = trades[trades["profit"] > 0]
    eq = INITIAL_CAPITAL + trades["profit"].cumsum()
    peak = eq.cummax()
    dd = (eq - peak) / peak * 100
    by_reason = trades.groupby("reason").size().to_dict()
    return {
        "label": label,
        "n": len(trades),
        "win_rate": round(len(wins) / len(trades) * 100, 1),
        "exp_pct": round(trades["ret_pct"].mean(), 3),
        "total_pct": round(trades["profit"].sum() / INITIAL_CAPITAL * 100, 2),
        "mdd_pct": round(float(dd.min()), 2),
        "tp_n": by_reason.get("take_profit", 0),
        "sl_n": by_reason.get("stop_loss", 0),
        "time_n": by_reason.get("time_exit", 0),
    }


def section_A_market_split():
    """A 시그널 (entry=-2.5%, candle≥+0.3%, tp+2, sl-1.5, hold30)을 KOSPI/KOSDAQ/전체에 적용."""
    print("\n=== A안 시장 분리 진단 (BEST 파라미터 고정) ===")
    rows = []
    for market_label, market in [("전체(218)", None), ("KOSPI(176)", "KOSPI"), ("KOSDAQ(42)", "KOSDAQ")]:
        data = load_all(market=market)
        sig_all = precompute_signals(data)
        sig = sig_all[(sig_all["prev_5m"] <= -2.5) & (sig_all["candle"] >= 0.3)].copy()
        sig["tp_pct"] = 2.0
        sig["sl_pct"] = 1.5
        sig["hold_min"] = 30
        # 가장 강한 급락 우선
        trades = run_simulation(data, sig, rank_col="prev_5m", ascending=True)
        rows.append({**summarize(trades, market_label)})
    df = pd.DataFrame(rows)
    print(df.to_string(index=False))
    return df


def section_B_grid():
    """B안: vol_ratio + candle + day_pct 조합."""
    print("\n=== B안 (vol+양봉+등락률 타이트) 그리드 ===")
    data = load_all()  # 전체 218
    sig_all = precompute_signals(data)
    sig_all = sig_all.dropna(subset=["vol_ratio"])

    grid_vol = [3.0, 5.0]
    grid_day = [(0, 2), (2, 5), (5, 10), (0, 5)]
    grid_tp = [0.8, 1.0, 1.5]
    grid_sl = [0.5, 0.8, 1.0]
    grid_hold = [10, 15, 30]
    combos = list(itertools.product(grid_vol, grid_day, grid_tp, grid_sl, grid_hold))
    print(f"[B] {len(combos)}조합")

    rows = []
    t0 = time.time()
    for i, (v, (dmin, dmax), tp, sl, hold) in enumerate(combos, 1):
        sig = sig_all[(sig_all["vol_ratio"] >= v) &
                      (sig_all["candle"] > 0) &
                      (sig_all["day_pct"] >= dmin) &
                      (sig_all["day_pct"] <= dmax)].copy()
        sig["tp_pct"] = tp
        sig["sl_pct"] = sl
        sig["hold_min"] = hold
        # 가장 큰 vol_ratio 우선
        trades = run_simulation(data, sig, rank_col="vol_ratio", ascending=False)
        s = summarize(trades, f"vol≥{v} day{dmin}-{dmax}% tp{tp} sl{sl} h{hold}")
        rows.append({
            "vol": v, "day": f"{dmin}-{dmax}", "tp": tp, "sl": sl, "hold": hold,
            "n": s["n"], "win%": s["win_rate"], "exp%": s["exp_pct"],
            "total%": s["total_pct"], "mdd%": s["mdd_pct"],
            "tp_n": s["tp_n"], "sl_n": s["sl_n"], "time_n": s["time_n"],
        })
        if i % 30 == 0:
            print(f"[B]   {i}/{len(combos)} elapsed={time.time()-t0:.1f}s")
    df = pd.DataFrame(rows).sort_values("total%", ascending=False)
    df.to_csv(REPORT_DIR / "backtest_B_grid.csv", index=False)
    print("\n--- TOP 15 (total%) ---")
    print(df.head(15).to_string(index=False))
    print("\n--- 빈도 풍부(n>=50) 상위 5 ---")
    print(df[df["n"] >= 50].head(5).to_string(index=False))
    return df


def main():
    a = section_A_market_split()
    a.to_csv(REPORT_DIR / "backtest_A_marketsplit.csv", index=False)
    b = section_B_grid()
    print("\n[B] BEST:", b.iloc[0].to_dict())


if __name__ == "__main__":
    main()
