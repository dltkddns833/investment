"""Q v2 — 분봉 캐시 확장 (yfinance 60일 한계 내 최대 확장)

기존 02_download_minute.py가 캐시한 4/21~5/21 (영업일 ~22) 외에:
  - 5/22 ~ 오늘: 신규 분봉 (영업일 ~12+)
  - 4/9 ~ 4/20:  yfinance 60일 한계 내 과거 확장 시도 (영업일 ~8)
  → 총 영업일 ~42일 확보 목표

기존 pkl과 concat → dedup → 저장. 캐시 있는 종목만 대상.
yfinance 1m 한계: 60일, 한 호출 7일.
"""
from __future__ import annotations

import sys
import time
import warnings
from pathlib import Path
from datetime import datetime, timedelta, date

import pandas as pd
import yfinance as yf

warnings.filterwarnings("ignore")

UNIVERSE_CSV = Path(__file__).parent / "cache" / "universe.csv"
MINUTE_DIR = Path(__file__).parent / "cache" / "minute"
BATCH_SIZE = 10
CHUNK_DAYS = 7
KST_OFFSET = pd.Timedelta(hours=9)


def get_chunks(target_start: date, target_end: date) -> list[tuple[str, str]]:
    """target_start ~ target_end 구간을 7일 chunk로 분할."""
    chunks = []
    end = target_end + timedelta(days=1)  # exclusive
    while end > target_start:
        start = max(end - timedelta(days=CHUNK_DAYS), target_start)
        chunks.append((start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")))
        if start == target_start:
            break
        end = start
    return chunks


def download_batch(tickers: list[str], start: str, end: str) -> pd.DataFrame | None:
    try:
        df = yf.download(
            tickers=tickers, start=start, end=end, interval="1m",
            group_by="ticker", auto_adjust=False, progress=False, threads=True,
        )
        if df is None or df.empty:
            return None
        return df
    except Exception as e:
        print(f"  [batch] error {e}")
        return None


def extract_ticker(df: pd.DataFrame, ticker: str) -> pd.DataFrame | None:
    try:
        if isinstance(df.columns, pd.MultiIndex):
            if ticker in df.columns.get_level_values(0):
                sub = df[ticker].copy()
            else:
                return None
        else:
            sub = df.copy()
        sub = sub.rename(columns={c: c.lower() for c in sub.columns})
        keep = ["open", "high", "low", "close", "volume"]
        if not all(k in sub.columns for k in keep):
            return None
        sub = sub[keep].dropna(how="all")
        if sub.index.tz is not None:
            sub.index = sub.index.tz_convert("Asia/Seoul").tz_localize(None)
        else:
            sub.index = sub.index + KST_OFFSET
        sub.index.name = "datetime"
        return sub
    except Exception:
        return None


def main():
    if not UNIVERSE_CSV.exists():
        sys.exit("universe.csv 없음")
    df_uni = pd.read_csv(UNIVERSE_CSV)
    tickers = df_uni["ticker"].tolist()

    # 캐시 있는 종목만 대상
    cached = [t for t in tickers if (MINUTE_DIR / f"{t}.pkl").exists()]
    print(f"[extend] 캐시 보유 종목 {len(cached)}/{len(tickers)}개")

    today = date.today()
    sixty_days_ago = today - timedelta(days=59)  # yfinance 60일 한계 안쪽

    # 기존 캐시의 min/max 분포 확인 (샘플)
    sample_pkl = pd.read_pickle(MINUTE_DIR / f"{cached[0]}.pkl")
    cached_min = sample_pkl.index.min().date()
    cached_max = sample_pkl.index.max().date()
    print(f"[extend] 기존 캐시 범위: {cached_min} ~ {cached_max}")
    print(f"[extend] yfinance 60일 한계: {sixty_days_ago} 이후 가능")

    # 확장 구간 (각 종목별로 다를 수 있어 통일된 윈도우 사용)
    extend_start = max(sixty_days_ago, date(2026, 4, 9))   # yfinance 한계 안
    extend_end = today
    print(f"[extend] 다운로드 구간: {extend_start} ~ {extend_end}")

    chunks = get_chunks(extend_start, extend_end)
    print(f"[extend] {len(chunks)} chunks:")
    for s, e in chunks:
        print(f"  {s} ~ {e}")

    # 누적 신규 분봉
    accum: dict[str, list[pd.DataFrame]] = {t: [] for t in cached}

    for ci, (start, end) in enumerate(chunks, 1):
        print(f"\n[extend] chunk {ci}/{len(chunks)} {start}~{end}")
        for bi in range(0, len(cached), BATCH_SIZE):
            batch = cached[bi:bi + BATCH_SIZE]
            t0 = time.time()
            df = download_batch(batch, start, end)
            if df is None:
                print(f"  batch {bi//BATCH_SIZE+1}: empty")
                continue
            n_ok = 0
            for t in batch:
                sub = extract_ticker(df, t)
                if sub is None or sub.empty:
                    continue
                accum[t].append(sub)
                n_ok += 1
            print(f"  batch {bi//BATCH_SIZE+1} ({len(batch)}종목): ok={n_ok} {time.time()-t0:.1f}s")
            time.sleep(0.3)

    # merge & 저장
    print("\n[extend] merge & 저장")
    new_min_dates, new_max_dates, total_bars = [], [], []
    saved = 0
    for t in cached:
        if not accum[t]:
            continue
        path = MINUTE_DIR / f"{t}.pkl"
        existing = pd.read_pickle(path)
        new = pd.concat(accum[t]).sort_index()
        merged = pd.concat([existing, new]).sort_index()
        merged = merged[~merged.index.duplicated(keep="first")]
        merged.to_pickle(path)
        saved += 1
        new_min_dates.append(merged.index.min().date())
        new_max_dates.append(merged.index.max().date())
        total_bars.append(len(merged))

    if saved:
        print(f"[extend] {saved}종목 갱신")
        print(f"  통합 범위: {min(new_min_dates)} ~ {max(new_max_dates)}")
        print(f"  분봉 수 (평균/min/max): "
              f"{sum(total_bars)//len(total_bars)} / {min(total_bars)} / {max(total_bars)}")
    else:
        print("[extend] 신규 데이터 없음")


if __name__ == "__main__":
    main()
