"""
Q v2.0 — A안 백테스트 (급락 반등)

시그널:
  - 진입 시각 t (분봉 종가 기준 평가)
  - prev_5m = (close[t] / close[t-5] - 1) * 100 <= -ENTRY_PCT
  - 현재 분봉 양봉: close[t] > open[t] * (1 + MIN_CANDLE_PCT/100)
  - 시간대: 09:30 <= t <= 14:00
  - 보유 중이 아닐 때만 신규 진입
  - 당일 같은 종목 재매수 금지

진입 / 청산:
  - 진입가 = 다음 분 시가 (현실적, 매수 +SLIPPAGE%)
  - 청산 우선순위 (보유 후 각 분봉마다):
      1) low <= 손절가  → 손절 매도 (손절가)
      2) high >= 익절가 → 익절 매도 (익절가)
      3) 시간 만료(HOLD_MIN) → 마지막 분봉 종가
    동일 분봉에 손절/익절 모두 도달 시 손절 우선 (보수적)
  - 매도가 = -SLIPPAGE%

비용:
  - 매수/매도 수수료 0.015% 각, 거래세 0.18% (매도 시)
  - 슬리피지 0.05% (매수 +, 매도 -)

자본:
  - 시드 5,000,000 KRW, 매매당 캡 10,000,000 KRW (복리)
  - 동시 보유 1종목

그리드 서치:
  ENTRY_PCT × MIN_CANDLE_PCT × TP_PCT × SL_PCT × HOLD_MIN
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
REPORT_DIR = Path(__file__).parent / "reports"
REPORT_DIR.mkdir(parents=True, exist_ok=True)

SLIPPAGE = 0.0005          # 0.05%
BUY_FEE = 0.00015
SELL_FEE = 0.00015
TAX = 0.0018               # 거래세
INITIAL_CAPITAL = 5_000_000
TRADE_CAP = 10_000_000
ENTRY_START = "09:30"
ENTRY_END = "14:00"


@dataclass
class Params:
    entry_pct: float       # prev_5m 임계 (양수 입력, 실제는 -entry_pct 이하)
    min_candle_pct: float  # 양봉 최소 강도 (%) — 0이면 단순 양봉
    tp_pct: float          # 익절 +%
    sl_pct: float          # 손절 -%
    hold_min: int          # 보유 시간 (분)


def load_all() -> dict[str, pd.DataFrame]:
    out = {}
    for f in sorted(glob.glob(str(MINUTE_DIR / "*.pkl"))):
        t = Path(f).stem
        df = pd.read_pickle(f)
        df = df.copy()
        df["date"] = df.index.date
        df["hm"] = df.index.strftime("%H:%M")
        out[t] = df
    return out


def precompute_signals(data: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """모든 종목 모든 분봉에 대해 prev_5m, candle 계산 후 long 형식 결합."""
    parts = []
    for t, df in data.items():
        d = df.copy()
        d["prev_5m"] = (d["close"] / d["close"].shift(5) - 1) * 100
        d["candle"] = (d["close"] - d["open"]) / d["open"] * 100
        d["ticker"] = t
        d = d[(d["hm"] >= ENTRY_START) & (d["hm"] <= ENTRY_END)]
        parts.append(d[["ticker", "date", "hm", "open", "high", "low", "close",
                        "prev_5m", "candle"]])
    out = pd.concat(parts)
    out.index.name = "datetime"
    return out


def backtest(data: dict[str, pd.DataFrame], signals_df: pd.DataFrame, p: Params) -> dict:
    """
    동시 1종목 보유 시뮬. 시각별로 후보 시그널 중 가장 강한(prev_5m가 최소) 종목 선택.
    """
    # 시그널 필터
    sig = signals_df[(signals_df["prev_5m"] <= -p.entry_pct) &
                     (signals_df["candle"] >= p.min_candle_pct)].copy()
    if sig.empty:
        return {"params": p, "n_trades": 0, "final_capital": INITIAL_CAPITAL}

    # 시각별 후보 종목 선택 (가장 큰 급락 = prev_5m 최소)
    sig = sig.sort_values(["datetime", "prev_5m"])
    sig = sig.groupby(sig.index).first()  # 시각별 1종목

    # 종목별 분봉 데이터 (high/low 조회용)
    # data[t]는 datetime index, columns open/high/low/close

    capital = INITIAL_CAPITAL
    holding: dict | None = None
    bought_today: dict = {}  # date -> set of tickers (당일 재매수 금지)
    trades = []

    # 보유 분봉 진행을 위해 전체 분봉을 시간 순회
    # 단순화: 시그널 발생 시각만 순회하며 진입 → 진입 후 종목 내부 분봉 forward 시뮬
    for ts, row in sig.iterrows():
        if holding is not None:
            continue  # 보유 중 신규 진입 안 함
        ticker = row["ticker"]
        d = row["date"]
        bought_set = bought_today.setdefault(d, set())
        if ticker in bought_set:
            continue
        # 진입가 = 다음 분 시가
        df_t = data[ticker]
        idx = df_t.index.get_indexer([ts])[0]
        if idx < 0 or idx + 1 >= len(df_t):
            continue
        next_bar = df_t.iloc[idx + 1]
        # 같은 영업일 안에서만 진입
        if next_bar.name.date() != d:
            continue
        entry_raw = float(next_bar["open"])
        if entry_raw <= 0:
            continue
        entry_price = entry_raw * (1 + SLIPPAGE)

        # 자본
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

        tp_price = entry_price * (1 + p.tp_pct / 100)
        sl_price = entry_price * (1 - p.sl_pct / 100)

        # 시간 청산 한도
        end_idx = min(idx + 1 + p.hold_min, len(df_t) - 1)
        exit_idx = None
        exit_price_raw = None
        exit_reason = None
        for j in range(idx + 1, end_idx + 1):
            bar = df_t.iloc[j]
            if bar.name.date() != d:
                # 일자 경계 (yfinance 14:59 후 다음 영업일)
                exit_idx = j - 1
                exit_price_raw = float(df_t.iloc[exit_idx]["close"])
                exit_reason = "day_end"
                break
            low = float(bar["low"])
            high = float(bar["high"])
            # 손절 우선 (보수적)
            if low <= sl_price:
                exit_idx = j
                exit_price_raw = sl_price
                exit_reason = "stop_loss"
                break
            if high >= tp_price:
                exit_idx = j
                exit_price_raw = tp_price
                exit_reason = "take_profit"
                break
            if j == end_idx:
                exit_idx = j
                exit_price_raw = float(bar["close"])
                exit_reason = "time_exit"

        if exit_idx is None or exit_price_raw is None:
            continue
        exit_price = exit_price_raw * (1 - SLIPPAGE)
        sell_amount = shares * exit_price
        sell_fee_amt = sell_amount * SELL_FEE
        tax_amt = sell_amount * TAX
        net_proceeds = sell_amount - sell_fee_amt - tax_amt
        profit = net_proceeds - cash_used
        capital += profit

        trades.append({
            "buy_ts": next_bar.name,
            "sell_ts": df_t.iloc[exit_idx].name,
            "ticker": ticker,
            "entry_price": entry_price,
            "exit_price": exit_price,
            "shares": shares,
            "profit": profit,
            "ret_pct": profit / cash_used * 100,
            "reason": exit_reason,
            "prev_5m": float(row["prev_5m"]),
            "candle": float(row["candle"]),
        })
        bought_set.add(ticker)
        # 보유 해제 (1종목 즉시 다음 시그널 받기 — 청산 후)
        holding = None

    # 통계
    if not trades:
        return {"params": p, "n_trades": 0, "final_capital": INITIAL_CAPITAL,
                "total_return_pct": 0.0}
    df_tr = pd.DataFrame(trades)
    wins = df_tr[df_tr["profit"] > 0]
    losses = df_tr[df_tr["profit"] <= 0]
    by_reason = df_tr.groupby("reason").size().to_dict()
    # MDD
    eq = INITIAL_CAPITAL + df_tr["profit"].cumsum()
    peak = eq.cummax()
    dd = (eq - peak) / peak * 100
    mdd = float(dd.min())

    return {
        "params": p,
        "n_trades": int(len(df_tr)),
        "win_rate": float(len(wins) / len(df_tr) * 100),
        "avg_win_pct": float(wins["ret_pct"].mean()) if len(wins) else 0.0,
        "avg_loss_pct": float(losses["ret_pct"].mean()) if len(losses) else 0.0,
        "expectancy_pct": float(df_tr["ret_pct"].mean()),
        "total_profit": float(df_tr["profit"].sum()),
        "final_capital": float(INITIAL_CAPITAL + df_tr["profit"].sum()),
        "total_return_pct": float(df_tr["profit"].sum() / INITIAL_CAPITAL * 100),
        "mdd_pct": mdd,
        "exit_tp": by_reason.get("take_profit", 0),
        "exit_sl": by_reason.get("stop_loss", 0),
        "exit_time": by_reason.get("time_exit", 0),
        "exit_dayend": by_reason.get("day_end", 0),
        "trades_df": df_tr,
    }


def grid_search(data, signals_df):
    grid_entry = [1.5, 2.0, 2.5, 3.0]
    grid_candle = [0.0, 0.3]
    grid_tp = [1.0, 1.5, 2.0]
    grid_sl = [1.0, 1.5, 2.0]
    grid_hold = [15, 30, 60]

    combos = list(itertools.product(grid_entry, grid_candle, grid_tp, grid_sl, grid_hold))
    print(f"[grid] {len(combos)}조합 시작")
    rows = []
    t0 = time.time()
    for i, (e, c, tp, sl, h) in enumerate(combos, 1):
        p = Params(entry_pct=e, min_candle_pct=c, tp_pct=tp, sl_pct=sl, hold_min=h)
        r = backtest(data, signals_df, p)
        rows.append({
            "entry": e, "candle": c, "tp": tp, "sl": sl, "hold": h,
            "n": r.get("n_trades", 0),
            "win%": round(r.get("win_rate", 0), 1),
            "exp%": round(r.get("expectancy_pct", 0), 3),
            "total%": round(r.get("total_return_pct", 0), 2),
            "mdd%": round(r.get("mdd_pct", 0), 2),
            "tp_n": r.get("exit_tp", 0),
            "sl_n": r.get("exit_sl", 0),
            "time_n": r.get("exit_time", 0),
        })
        if i % 20 == 0:
            print(f"[grid]   {i}/{len(combos)} elapsed={time.time()-t0:.1f}s")
    df = pd.DataFrame(rows).sort_values("total%", ascending=False)
    return df


def main():
    print("[A] 데이터 로드 중...")
    data = load_all()
    print(f"[A] {len(data)}종목")
    print("[A] 시그널 사전 계산...")
    sig = precompute_signals(data)
    print(f"[A] 시그널 후보 분봉 수: {len(sig):,}")

    print("\n=== 그리드 서치 ===")
    df_grid = grid_search(data, sig)
    df_grid.to_csv(REPORT_DIR / "backtest_A_grid.csv", index=False)
    print("\n--- TOP 15 (total%) ---")
    print(df_grid.head(15).to_string(index=False))
    print("\n--- BOTTOM 5 ---")
    print(df_grid.tail(5).to_string(index=False))
    print("\n--- 빈도 풍부(n>=30) 상위 10 ---")
    print(df_grid[df_grid["n"] >= 30].head(10).to_string(index=False))

    # 최적 조합 상세
    best = df_grid.iloc[0]
    print(f"\n[A] BEST: entry≤-{best['entry']}% candle≥{best['candle']}% tp+{best['tp']}% sl-{best['sl']}% hold{best['hold']}m")
    print(f"     n={best['n']}, win={best['win%']}%, exp={best['exp%']}%, total={best['total%']}%, mdd={best['mdd%']}%")


if __name__ == "__main__":
    main()
