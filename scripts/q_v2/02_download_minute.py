"""
Q v2.0 — 1분봉 다운로드 (yfinance, 최근 30일)

yfinance 한도:
  - 1m interval은 60일 이내 데이터만
  - 한 요청에 7일까지

전략:
  - 7일 chunk × 5번 = 35일치 시도 (실제 영업일 ~22일 확보 예상)
  - 종목 배치(10개씩) 다운로드 → 메모리/속도 균형
  - 종목별 pickle로 cache/minute/{ticker}.pkl 저장
  - 이미 캐시 있으면 skip (재실행 안전)

출력 컬럼: datetime(KST), open, high, low, close, volume
"""
from __future__ import annotations

import sys
import time
import warnings
from pathlib import Path
from datetime import datetime, timedelta

import pandas as pd
import yfinance as yf

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

UNIVERSE_CSV = Path(__file__).parent / "cache" / "universe.csv"
MINUTE_DIR = Path(__file__).parent / "cache" / "minute"
BATCH_SIZE = 10
CHUNK_DAYS = 7
N_CHUNKS = 4   # 7d × 4 = 28일치 (yfinance 1m은 ~30일이 안정적 한계)
KST_OFFSET = pd.Timedelta(hours=9)


def get_chunks() -> list[tuple[str, str]]:
    """[(start, end)] — 가장 최근부터 7일씩 5개 chunk."""
    chunks = []
    end = datetime.now().date() + timedelta(days=1)  # exclusive end
    for _ in range(N_CHUNKS):
        start = end - timedelta(days=CHUNK_DAYS)
        chunks.append((start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")))
        end = start
    return chunks


def download_batch(tickers: list[str], start: str, end: str) -> pd.DataFrame | None:
    """배치 다운로드. 결과 컬럼은 multi-index (price, ticker)."""
    try:
        df = yf.download(
            tickers=tickers,
            start=start,
            end=end,
            interval="1m",
            group_by="ticker",
            auto_adjust=False,
            progress=False,
            threads=True,
        )
        if df is None or df.empty:
            return None
        return df
    except Exception as e:
        print(f"  [batch] error {e}")
        return None


def extract_ticker(df: pd.DataFrame, ticker: str) -> pd.DataFrame | None:
    """multi-index DataFrame에서 단일 ticker 추출 → 표준 5컬럼."""
    try:
        if isinstance(df.columns, pd.MultiIndex):
            # group_by='ticker'면 (ticker, price)
            if ticker in df.columns.get_level_values(0):
                sub = df[ticker].copy()
            else:
                return None
        else:
            sub = df.copy()
        # 표준화
        sub = sub.rename(columns={c: c.lower() for c in sub.columns})
        keep = ["open", "high", "low", "close", "volume"]
        if not all(k in sub.columns for k in keep):
            return None
        sub = sub[keep].dropna(how="all")
        # UTC index → KST
        if sub.index.tz is not None:
            sub.index = sub.index.tz_convert("Asia/Seoul").tz_localize(None)
        else:
            sub.index = sub.index + KST_OFFSET
        sub.index.name = "datetime"
        # volume 0 bar 유지 (장 시작 09:00, 마감 등 — 분석 단계에서 처리)
        return sub
    except Exception:
        return None


def main(force: bool = False) -> None:
    if not UNIVERSE_CSV.exists():
        sys.exit("universe.csv 없음. 먼저 01_universe.py 실행.")

    df_uni = pd.read_csv(UNIVERSE_CSV)
    tickers = df_uni["ticker"].tolist()
    print(f"[download] 종목 {len(tickers)}개, chunk {N_CHUNKS}개 (×{CHUNK_DAYS}일)")

    MINUTE_DIR.mkdir(parents=True, exist_ok=True)
    chunks = get_chunks()
    for s, e in chunks:
        print(f"  chunk {s} ~ {e}")

    # 종목별 누적 DataFrame
    accum: dict[str, list[pd.DataFrame]] = {t: [] for t in tickers}

    # cache hit 종목 스킵
    pending = []
    for t in tickers:
        path = MINUTE_DIR / f"{t}.pkl"
        if path.exists() and not force:
            continue
        pending.append(t)
    print(f"[download] cache miss: {len(pending)}/{len(tickers)} (cached skip)")
    if not pending:
        print("[download] 모두 캐시 hit. --force로 재다운로드 가능.")
        return

    # chunk 루프
    for ci, (start, end) in enumerate(chunks, 1):
        print(f"\n[download] chunk {ci}/{N_CHUNKS} {start}~{end}")
        for bi in range(0, len(pending), BATCH_SIZE):
            batch = pending[bi:bi + BATCH_SIZE]
            t0 = time.time()
            df = download_batch(batch, start, end)
            if df is None:
                print(f"  batch {bi//BATCH_SIZE+1}: empty (skip)")
                continue
            n_ok = 0
            for t in batch:
                sub = extract_ticker(df, t)
                if sub is None or sub.empty:
                    continue
                accum[t].append(sub)
                n_ok += 1
            print(f"  batch {bi//BATCH_SIZE+1} ({len(batch)}종목): ok={n_ok} {time.time()-t0:.1f}s")
            time.sleep(0.3)   # rate limit 완화

    # 종목별 저장
    saved = 0
    for t, parts in accum.items():
        if not parts:
            continue
        merged = pd.concat(parts).sort_index()
        merged = merged[~merged.index.duplicated(keep="first")]
        path = MINUTE_DIR / f"{t}.pkl"
        merged.to_pickle(path)
        saved += 1
    print(f"\n[download] 저장 {saved}종목 → {MINUTE_DIR}/")

    # 샘플 통계
    if saved:
        any_t = next(t for t, p in accum.items() if p)
        sample = pd.read_pickle(MINUTE_DIR / f"{any_t}.pkl")
        print(f"\n[sample] {any_t}: {len(sample)}bars, "
              f"{sample.index.min()} ~ {sample.index.max()}")


if __name__ == "__main__":
    force = "--force" in sys.argv
    main(force=force)
