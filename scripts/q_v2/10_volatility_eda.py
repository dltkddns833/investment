"""
변동성 분위수별 v2.1 시그널 EDA

가설: 변동성 큰 종목 풀에서 v2.1 시그널 빈도와 기대값이 어떻게 달라지는가?

절차:
  1. 218 종목 캐시 → 일중 변동성(daily range = (high-low)/open) 평균 계산
  2. 변동성 기준 Q1(저변동) ~ Q5(고변동) 5분위 분할
  3. 분위수별로 v2.1 시그널(직전 5분 ≤ -2.5% AND 양봉 ≥ +0.3%) 시뮬레이션
     - 진입 윈도우: 09:30 ~ 14:00
     - 청산: +2.5% / -1.5% / 30분 시간청산
     - 당일 재매수 금지 (종목별)
     - 매분 다음 캔들 시가로 체결
  4. 분위수별 매매 횟수, 승률, 평균 수익률, 누적 수익률, MDD 비교
"""
from __future__ import annotations

import glob
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

MINUTE_DIR = Path(__file__).parent / "cache" / "minute"

# v2.1 룰
PREV_5M_THRESHOLD = -2.5  # %
CANDLE_THRESHOLD = 0.3    # %
TAKE_PROFIT = 2.5         # %
STOP_LOSS = -1.5          # %
TIME_EXIT_MIN = 30
ENTRY_START = "09:30"
ENTRY_END = "14:00"


def load_all() -> dict[str, pd.DataFrame]:
    out = {}
    for f in sorted(glob.glob(str(MINUTE_DIR / "*.pkl"))):
        ticker = Path(f).stem
        df = pd.read_pickle(f)
        if df.empty or len(df) < 100:
            continue
        df = df.sort_index()
        out[ticker] = df
    return out


def compute_volatility(data: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """종목별 일중 변동성 평균 계산."""
    rows = []
    for ticker, df in data.items():
        daily = df.groupby(df.index.date).agg(
            high=("high", "max"), low=("low", "min"), open=("open", "first")
        )
        daily["range_pct"] = (daily["high"] - daily["low"]) / daily["open"] * 100
        rows.append({
            "ticker": ticker,
            "vol_mean": daily["range_pct"].mean(),
            "vol_median": daily["range_pct"].median(),
            "n_days": len(daily),
        })
    return pd.DataFrame(rows).sort_values("vol_mean").reset_index(drop=True)


def simulate_ticker(df: pd.DataFrame) -> list[dict]:
    """단일 종목 v2.1 시그널 시뮬레이션. 트레이드 리스트 반환.

    체결 가정: 시그널 분의 종가가 양봉 +0.3% 이상이면, 같은 분 종가로 매수.
    (실시간 q_monitor는 시장가 매수 → 보수적으로 시그널 분 close 사용)
    청산: 매수 후 각 분의 high가 TP 도달 시 TP가 청산, low가 SL 도달 시 SL가 청산,
          30분 경과 시 그 분의 close로 시간청산.
    """
    trades = []
    df = df.sort_index()
    df["time_str"] = df.index.strftime("%H:%M")

    # 종목별 당일 진입 여부 추적
    traded_dates: set = set()

    closes = df["close"].values
    opens = df["open"].values
    highs = df["high"].values
    lows = df["low"].values
    idx = df.index

    n = len(df)
    for i in range(5, n):
        ts = idx[i]
        date = ts.date()
        if date in traded_dates:
            continue
        # 진입 윈도우 체크
        t = ts.strftime("%H:%M")
        if t < ENTRY_START or t >= ENTRY_END:
            continue
        # 직전 5분 수익률
        prev_close = closes[i - 5]
        curr_close = closes[i]
        if prev_close <= 0:
            continue
        prev_5m = (curr_close / prev_close - 1) * 100
        if prev_5m > PREV_5M_THRESHOLD:
            continue
        # 현재 캔들 양봉 비율
        curr_open = opens[i]
        if curr_open <= 0:
            continue
        candle = (curr_close - curr_open) / curr_open * 100
        if candle < CANDLE_THRESHOLD:
            continue
        # 진입 (시그널 분 종가)
        entry_price = curr_close
        entry_time = ts
        traded_dates.add(date)

        # 청산 루프
        tp_price = entry_price * (1 + TAKE_PROFIT / 100)
        sl_price = entry_price * (1 + STOP_LOSS / 100)
        exit_idx = None
        exit_reason = None
        exit_price = None
        for j in range(i + 1, n):
            ts_j = idx[j]
            # 같은 날짜 + 진입 후 30분 이내
            if ts_j.date() != date:
                # 종가 전 마지막 캔들로 강제 청산
                exit_idx = j - 1
                exit_reason = "EOD"
                exit_price = closes[exit_idx]
                break
            mins_elapsed = (ts_j - entry_time).total_seconds() / 60
            # 우선 SL/TP 체크 (보수적: 손절 우선)
            if lows[j] <= sl_price:
                exit_idx = j
                exit_reason = "SL"
                exit_price = sl_price
                break
            if highs[j] >= tp_price:
                exit_idx = j
                exit_reason = "TP"
                exit_price = tp_price
                break
            if mins_elapsed >= TIME_EXIT_MIN:
                exit_idx = j
                exit_reason = "TIME"
                exit_price = closes[j]
                break
        else:
            # 루프 끝까지 청산 못함
            exit_idx = n - 1
            exit_reason = "EOD_END"
            exit_price = closes[exit_idx]

        pnl_pct = (exit_price / entry_price - 1) * 100
        trades.append({
            "entry_time": entry_time,
            "exit_time": idx[exit_idx] if exit_idx is not None else None,
            "entry_price": entry_price,
            "exit_price": exit_price,
            "pnl_pct": pnl_pct,
            "reason": exit_reason,
            "prev_5m": prev_5m,
            "candle": candle,
        })

    return trades


def aggregate(trades: list[dict]) -> dict:
    if not trades:
        return {
            "n_trades": 0, "win_rate": np.nan, "avg_pnl": np.nan,
            "median_pnl": np.nan, "total_pnl": np.nan, "mdd": np.nan,
            "tp_count": 0, "sl_count": 0, "time_count": 0,
        }
    df = pd.DataFrame(trades)
    # 누적 수익률 (단순합, 각 매매 1단위)
    df = df.sort_values("entry_time").reset_index(drop=True)
    df["cum_pnl"] = df["pnl_pct"].cumsum()
    # MDD
    running_max = df["cum_pnl"].cummax()
    drawdown = df["cum_pnl"] - running_max
    mdd = drawdown.min()
    return {
        "n_trades": len(df),
        "win_rate": (df["pnl_pct"] > 0).mean() * 100,
        "avg_pnl": df["pnl_pct"].mean(),
        "median_pnl": df["pnl_pct"].median(),
        "total_pnl": df["pnl_pct"].sum(),
        "mdd": mdd,
        "tp_count": (df["reason"] == "TP").sum(),
        "sl_count": (df["reason"] == "SL").sum(),
        "time_count": (df["reason"] == "TIME").sum(),
    }


def main():
    print(f"📊 캐시 로드 중: {MINUTE_DIR}")
    data = load_all()
    print(f"  종목 수: {len(data)}")

    # 기간 확인
    first_ticker = next(iter(data.values()))
    print(f"  기간: {first_ticker.index.min()} ~ {first_ticker.index.max()}")

    # 1. 변동성 계산
    print("\n🔧 변동성 계산 중...")
    vol_df = compute_volatility(data)
    print(f"  vol_mean 분포: min={vol_df['vol_mean'].min():.2f}%, "
          f"median={vol_df['vol_mean'].median():.2f}%, "
          f"max={vol_df['vol_mean'].max():.2f}%")

    # 2. 분위수 분할
    vol_df["quintile"] = pd.qcut(vol_df["vol_mean"], 5,
                                  labels=["Q1_low", "Q2", "Q3", "Q4", "Q5_high"])
    print("\n📈 분위수별 종목 수 + 평균 변동성:")
    print(vol_df.groupby("quintile").agg(
        n=("ticker", "count"),
        vol_min=("vol_mean", "min"),
        vol_mean=("vol_mean", "mean"),
        vol_max=("vol_mean", "max"),
    ).round(2))

    # 3. 분위수별 시뮬레이션
    print("\n⚙️  분위수별 v2.1 시그널 시뮬레이션...")
    results = {}
    all_trades_by_q = {}
    for q in vol_df["quintile"].cat.categories:
        tickers = vol_df.loc[vol_df["quintile"] == q, "ticker"].tolist()
        trades_all = []
        for t in tickers:
            trades_all.extend(simulate_ticker(data[t]))
        agg = aggregate(trades_all)
        agg["n_tickers"] = len(tickers)
        results[q] = agg
        all_trades_by_q[q] = trades_all
        print(f"  {q}: 종목 {len(tickers)}, 매매 {agg['n_trades']}, "
              f"승률 {agg['win_rate']:.1f}%, 평균 {agg['avg_pnl']:+.2f}%")

    # 4. 전체 (베이스라인)
    all_trades = [tr for q in all_trades_by_q.values() for tr in q]
    all_agg = aggregate(all_trades)
    all_agg["n_tickers"] = len(data)
    results["ALL"] = all_agg

    # 결과 표
    print("\n" + "=" * 78)
    print("📊 분위수별 결과 (v2.1 시그널: 5분 ≤ -2.5% + 양봉 ≥ +0.3%, +2.5/-1.5/30m 청산)")
    print("=" * 78)
    out = pd.DataFrame(results).T
    cols = ["n_tickers", "n_trades", "win_rate", "avg_pnl",
            "median_pnl", "total_pnl", "mdd", "tp_count", "sl_count", "time_count"]
    out = out[cols]
    out = out.round(2)
    print(out.to_string())
    print()

    # 단위 시드 1만원당 누적 손익 환산 (참고용, 거래비용 무시)
    print("📝 참고:")
    print(f"  - 기간: {first_ticker.index.min().strftime('%Y-%m-%d')} ~ "
          f"{first_ticker.index.max().strftime('%Y-%m-%d')}")
    print(f"  - 거래비용 미반영 (실전은 매매당 약 -0.25% 차감)")
    print(f"  - 시그널 분 종가로 매수 가정 (실전 시장가는 슬리피지 추가)")
    print(f"  - 종목별 당일 재매수 금지, 동시 보유 제한 없음 (분위수 풀 전체 누적)")


if __name__ == "__main__":
    main()
