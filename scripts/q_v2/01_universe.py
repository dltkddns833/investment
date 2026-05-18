"""
Q v2.0 — 종목 풀 정의 (단일 종목 조회 우회)

pykrx의 멀티종목 API(get_market_ohlcv, get_market_cap_by_ticker)가
KRX 응답 변경으로 작동하지 않아, 단일 종목 by_date 조회로 우회.

후보 풀:
  - stock_universe (config.stock_universe, 100종목)
  - KOSPI200 정적 리스트 (kospi200.py, 198종목)
  - KIS 거래대금 순위 API로 받은 KOSPI/KOSDAQ 상위 (option, 2단계에서)

필터 (최근 20영업일):
  - 일평균 거래대금 >= 30억원
  - 최근 종가 >= 1,000원

출력: scripts/q_v2/cache/universe.csv
컬럼: ticker, code, market, name, avg_value_krw, last_close, n_days
"""
from __future__ import annotations

import sys
import time
from pathlib import Path
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

import pandas as pd
from pykrx import stock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.core.supabase_client import supabase
from scripts.core.kospi200 import KOSPI200_CODES

OUT = Path(__file__).parent / "cache" / "universe.csv"
MIN_AVG_VALUE = 3_000_000_000      # 30억
MIN_PRICE = 1_000
LOOKBACK_DAYS = 35                 # 영업일 ~20개 확보
MAX_WORKERS = 16


def fetch_candidates() -> list[tuple[str, str]]:
    """[(code, market_guess)] 후보 리스트 반환."""
    cands: dict[str, str] = {}

    # 1) KOSPI200 (코스피)
    for code in KOSPI200_CODES:
        cands[code] = "KOSPI"

    # 2) stock_universe (KS/KQ 모두)
    cfg = supabase.table("config").select("stock_universe").eq("id", 1).execute().data[0]
    for item in cfg["stock_universe"]:
        ticker = item["ticker"]
        code = ticker.split(".")[0]
        market = "KOSPI" if ticker.endswith(".KS") else "KOSDAQ"
        if code not in cands:
            cands[code] = market

    return list(cands.items())


def fetch_one(code: str, market: str, start: str, end: str) -> dict | None:
    """단일 종목 최근 LOOKBACK_DAYS OHLCV로 평균 거래대금/마지막 종가 산출."""
    try:
        df = stock.get_market_ohlcv_by_date(start, end, code)
    except Exception:
        return None
    if df is None or df.empty:
        return None
    # 거래대금이 컬럼에 없을 수 있어 직접 계산: 종가 * 거래량 평균
    # by_date 응답 컬럼: 시가/고가/저가/종가/거래량/등락률
    if "종가" not in df.columns or "거래량" not in df.columns:
        return None
    df = df[(df["거래량"] > 0)]
    if df.empty:
        return None
    df["value"] = df["종가"].astype(float) * df["거래량"].astype(float)
    avg_value = float(df["value"].mean())
    last_close = float(df["종가"].iloc[-1])
    n_days = int(len(df))

    if avg_value < MIN_AVG_VALUE or last_close < MIN_PRICE:
        return None

    try:
        name = stock.get_market_ticker_name(code)
    except Exception:
        name = code

    suffix = ".KS" if market == "KOSPI" else ".KQ"
    return {
        "ticker": f"{code}{suffix}",
        "code": code,
        "market": market,
        "name": name,
        "avg_value_krw": int(avg_value),
        "last_close": int(last_close),
        "n_days": n_days,
    }


def main() -> None:
    today = datetime.now()
    end = today.strftime("%Y%m%d")
    start = (today - timedelta(days=LOOKBACK_DAYS)).strftime("%Y%m%d")
    print(f"[universe] 기간: {start} ~ {end}")

    cands = fetch_candidates()
    print(f"[universe] 후보: {len(cands)}종목 (KOSPI200 + stock_universe)")

    rows: list[dict] = []
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futs = {ex.submit(fetch_one, code, market, start, end): code for code, market in cands}
        done = 0
        for fut in as_completed(futs):
            done += 1
            if done % 50 == 0:
                print(f"[universe]   진행 {done}/{len(cands)} elapsed={time.time()-t0:.1f}s")
            r = fut.result()
            if r:
                rows.append(r)

    df = pd.DataFrame(rows).sort_values("avg_value_krw", ascending=False).reset_index(drop=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT, index=False)

    print(f"[universe] 통과 {len(df)}종목 (KOSPI={sum(df.market=='KOSPI')}, KOSDAQ={sum(df.market=='KOSDAQ')})")
    print(f"[universe] 저장: {OUT}")
    print()
    print(df.head(25).to_string(index=False))
    print("...")
    print(df.tail(10).to_string(index=False))


if __name__ == "__main__":
    main()
