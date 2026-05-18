"""
Q v2.0 — EDA (가설 없이 데이터가 말하게)

분석 항목:
  A. 시간대별 5/15/30분 후 수익률 분포
  B. 거래량 폭증 시그널 (1m vol / 5MA) 강도별 후속 수익률
  C. 갭 상승/하락 (전일 종가 대비 시가)별 첫 30분 흐름
  D. 연속 양봉 N개 + vol 증가 패턴 후 흐름
  E. 직전 N분 고가 돌파 시 후속 흐름

출력: reports/eda_report.md + reports/eda_<section>.csv
"""
from __future__ import annotations

import sys
import warnings
from pathlib import Path
import glob
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

MINUTE_DIR = Path(__file__).parent / "cache" / "minute"
REPORT_DIR = Path(__file__).parent / "reports"
REPORT_DIR.mkdir(parents=True, exist_ok=True)

# 분석 시간 (KST). yfinance가 14:59까지만 주므로 모니터링 한도 14:50까지.
TRADING_START = "09:00"
TRADING_END = "14:59"


def load_all() -> dict[str, pd.DataFrame]:
    out = {}
    for f in sorted(glob.glob(str(MINUTE_DIR / "*.pkl"))):
        t = Path(f).stem
        df = pd.read_pickle(f)
        # 표준화: 시각/일자 컬럼 추가
        df = df.copy()
        df["date"] = df.index.date
        df["hm"] = df.index.strftime("%H:%M")
        out[t] = df
    return out


def fwd_returns(df: pd.DataFrame, base: str = "close", horizons: list[int] = [5, 15, 30]) -> pd.DataFrame:
    """각 행에 대해 H분 후 close 기준 수익률 (%)."""
    out = pd.DataFrame(index=df.index)
    out["base"] = df[base]
    for h in horizons:
        out[f"fwd_{h}m"] = (df[base].shift(-h) / df[base] - 1) * 100
    return out


# --------- A. 시간대별 분포 ---------
def section_A(data: dict[str, pd.DataFrame]) -> pd.DataFrame:
    rows = []
    for t, df in data.items():
        fwd = fwd_returns(df, horizons=[5, 15, 30])
        fwd["hm"] = df["hm"]
        rows.append(fwd)
    all_fwd = pd.concat(rows, ignore_index=True)
    grouped = all_fwd.groupby("hm").agg(
        n=("fwd_5m", "count"),
        mean_5m=("fwd_5m", "mean"),
        mean_15m=("fwd_15m", "mean"),
        mean_30m=("fwd_30m", "mean"),
        std_5m=("fwd_5m", "std"),
        std_30m=("fwd_30m", "std"),
        winrate_5m=("fwd_5m", lambda x: (x > 0).mean() * 100),
        winrate_30m=("fwd_30m", lambda x: (x > 0).mean() * 100),
    )
    # 표준오차로 의미 있는 시점만 표시 (n>=100)
    grouped = grouped[grouped["n"] >= 100].round(3)
    return grouped


# --------- B. 거래량 폭증 시그널 ---------
def section_B(data: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """
    각 분봉에 대해:
      vol_ratio = 현재 거래량 / 직전 5분 평균 거래량
      candle = (close - open) / open * 100  (현재 분봉 자체 변화)
      day_pct = (open - 일일 시가) / 일일 시가 * 100  (당일 진입 시점 등락률)
    시그널: vol_ratio가 N배 이상 + candle 부호별 → 후속 수익률
    """
    rows = []
    for t, df in data.items():
        df2 = df.copy()
        df2["vol_5ma"] = df2["volume"].rolling(5).mean().shift(1)  # 직전 5분 평균 (현재 제외)
        df2["vol_ratio"] = df2["volume"] / df2["vol_5ma"].replace(0, np.nan)
        df2["candle"] = (df2["close"] - df2["open"]) / df2["open"] * 100
        # 일일 시가
        day_open = df2.groupby("date")["open"].transform("first")
        df2["day_pct"] = (df2["open"] / day_open - 1) * 100
        # 시간대 필터: 09:30~14:00만 (시가/마감 호가 영향 제거)
        df2 = df2[(df2["hm"] >= "09:30") & (df2["hm"] <= "14:00")]
        # forward
        for h in [5, 15, 30]:
            df2[f"fwd_{h}m"] = (df2["close"].shift(-h) / df2["close"] - 1) * 100
        df2["ticker"] = t
        rows.append(df2[["ticker", "vol_ratio", "candle", "day_pct",
                         "fwd_5m", "fwd_15m", "fwd_30m"]])
    all_sig = pd.concat(rows, ignore_index=True).dropna()
    # 버킷
    bins = [0, 1, 2, 3, 5, 10, 1e9]
    labels = ["<1x", "1~2x", "2~3x", "3~5x", "5~10x", ">10x"]
    all_sig["vol_bucket"] = pd.cut(all_sig["vol_ratio"], bins=bins, labels=labels)
    all_sig["candle_dir"] = np.where(all_sig["candle"] > 0, "양봉", "음봉")
    # day_pct 버킷
    db = [-100, -5, -2, 0, 2, 5, 10, 100]
    dl = ["<-5%", "-5~-2%", "-2~0%", "0~2%", "2~5%", "5~10%", ">10%"]
    all_sig["day_bucket"] = pd.cut(all_sig["day_pct"], bins=db, labels=dl)

    # 핵심 표: vol_bucket × candle_dir × fwd
    g = all_sig.groupby(["vol_bucket", "candle_dir"], observed=True).agg(
        n=("fwd_5m", "count"),
        mean_5m=("fwd_5m", "mean"),
        mean_15m=("fwd_15m", "mean"),
        mean_30m=("fwd_30m", "mean"),
        winrate_5m=("fwd_5m", lambda x: (x > 0).mean() * 100),
        winrate_30m=("fwd_30m", lambda x: (x > 0).mean() * 100),
    ).round(3)

    # 추가: vol≥3x AND 양봉 AND day_pct 버킷별
    sub = all_sig[(all_sig["vol_ratio"] >= 3) & (all_sig["candle"] > 0)]
    g2 = sub.groupby("day_bucket", observed=True).agg(
        n=("fwd_5m", "count"),
        mean_5m=("fwd_5m", "mean"),
        mean_15m=("fwd_15m", "mean"),
        mean_30m=("fwd_30m", "mean"),
        winrate_15m=("fwd_15m", lambda x: (x > 0).mean() * 100),
    ).round(3)

    return g, g2, all_sig


# --------- C. 갭별 첫 30분 ---------
def section_C(data: dict[str, pd.DataFrame]) -> pd.DataFrame:
    rows = []
    for t, df in data.items():
        for d, g in df.groupby("date"):
            if len(g) < 31:
                continue
            day_open = float(g.iloc[0]["open"])
            # 전일 종가 = 직전 영업일 마지막 분봉 close
            # 단순화: 데이터셋 내 직전 일자 마지막 close
            # 일자 정렬 후 인덱스로 찾기
            pass
        # 간단화: 첫 분봉 vs 30분 후 close
        df2 = df.copy()
        opens = df2.groupby("date")["open"].first()
        close_30 = df2[df2["hm"] == "09:30"].groupby("date")["close"].first()
        merged = pd.DataFrame({"open": opens, "close_30": close_30}).dropna()
        merged["first_30m_pct"] = (merged["close_30"] / merged["open"] - 1) * 100
        merged["ticker"] = t
        rows.append(merged.reset_index())
    all_open = pd.concat(rows, ignore_index=True)
    # 첫 30분 변화 분포
    summary = all_open["first_30m_pct"].describe(percentiles=[0.05, 0.25, 0.5, 0.75, 0.95])
    return summary, all_open


# --------- D. 모멘텀: 직전 N분 vs 향후 N분 자기상관 ---------
def section_D(data: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """직전 5분 수익률 → 다음 5/15/30분 수익률 상관/평균."""
    rows = []
    for t, df in data.items():
        df2 = df.copy()
        df2["prev_5m"] = (df2["close"] / df2["close"].shift(5) - 1) * 100
        for h in [5, 15, 30]:
            df2[f"fwd_{h}m"] = (df2["close"].shift(-h) / df2["close"] - 1) * 100
        df2 = df2[(df2["hm"] >= "09:30") & (df2["hm"] <= "14:00")]
        rows.append(df2[["prev_5m", "fwd_5m", "fwd_15m", "fwd_30m"]])
    all_m = pd.concat(rows, ignore_index=True).dropna()
    # prev_5m 버킷별 fwd
    bins = [-100, -3, -1, -0.3, 0.3, 1, 3, 100]
    labels = ["<-3%", "-3~-1%", "-1~-0.3%", "-0.3~0.3%", "0.3~1%", "1~3%", ">3%"]
    all_m["prev_bucket"] = pd.cut(all_m["prev_5m"], bins=bins, labels=labels)
    g = all_m.groupby("prev_bucket", observed=True).agg(
        n=("fwd_5m", "count"),
        mean_5m=("fwd_5m", "mean"),
        mean_15m=("fwd_15m", "mean"),
        mean_30m=("fwd_30m", "mean"),
        winrate_5m=("fwd_5m", lambda x: (x > 0).mean() * 100),
        winrate_30m=("fwd_30m", lambda x: (x > 0).mean() * 100),
    ).round(3)
    return g


def main() -> None:
    print("[eda] 데이터 로드 중...")
    data = load_all()
    print(f"[eda] {len(data)}종목 로드")

    print("\n=== A. 시간대별 후속 수익률 (분 단위) ===")
    a = section_A(data)
    a.to_csv(REPORT_DIR / "eda_A_timeofday.csv")
    # 30분 후 평균 수익률 기준 상/하위 10개
    print("--- 30분 후 평균 수익률 상위 10개 시간대 ---")
    print(a.sort_values("mean_30m", ascending=False).head(10))
    print("--- 30분 후 평균 수익률 하위 10개 시간대 ---")
    print(a.sort_values("mean_30m").head(10))

    print("\n=== B. 거래량 폭증 시그널 (vol_ratio × 캔들 방향) ===")
    b, b2, _ = section_B(data)
    b.to_csv(REPORT_DIR / "eda_B_volsignal.csv")
    print(b)
    print("\n--- B-2: vol≥3x AND 양봉, 진입 시 등락률 버킷별 ---")
    b2.to_csv(REPORT_DIR / "eda_B2_volsignal_daybucket.csv")
    print(b2)

    print("\n=== C. 첫 30분 (09:00 시가 → 09:30 종가) 변화 분포 ===")
    c, _ = section_C(data)
    print(c.round(3))

    print("\n=== D. 모멘텀: 직전 5분 수익률 → 후속 ===")
    d = section_D(data)
    d.to_csv(REPORT_DIR / "eda_D_momentum.csv")
    print(d)


if __name__ == "__main__":
    main()
