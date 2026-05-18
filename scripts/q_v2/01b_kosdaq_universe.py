"""
Q v2.0 — KOSDAQ 풀 보강

기존 universe.csv (KOSPI 176 + KOSDAQ 21)에 KOSDAQ 거래대금/등락률 상위 종목 추가.

방법:
  1. KIS 거래대금 순위 (FHPST01710000) — KOSDAQ만, blng_cls=3(거래금액순)
  2. KIS 등락률 순위 (FHPST01700000) — KOSDAQ만, 등락률 다양한 범위로 ~120개 확보
  3. 합치고 중복 제거
  4. 각 종목에 대해 pykrx로 최근 20영업일 평균 거래대금/종가 검증 (≥30억, ≥1,000원)
  5. universe.csv 업데이트
"""
from __future__ import annotations

import sys
import time
import warnings
import requests
from pathlib import Path
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

import pandas as pd
from pykrx import stock

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.core.broker_client import KISClient

UNIVERSE_CSV = Path(__file__).parent / "cache" / "universe.csv"

MIN_AVG_VALUE = 3_000_000_000
MIN_PRICE = 1_000
LOOKBACK_DAYS = 35
MAX_WORKERS = 16


def fetch_kosdaq_candidates(client: KISClient) -> set[str]:
    """KIS 순위 API로 KOSDAQ 후보 종목 모으기."""
    codes: set[str] = set()

    # 1) 거래대금 순위 (blng_cls=3 거래금액순) — KOSDAQ
    url1 = f"{client.base_url}/uapi/domestic-stock/v1/quotations/volume-rank"
    headers = client._headers("FHPST01710000")
    params1 = {
        "FID_COND_MRKT_DIV_CODE": "J",
        "FID_COND_SCR_DIV_CODE": "20171",
        "FID_INPUT_ISCD": "1002",          # 1002=KOSDAQ 종목 (시장 구분 코드)
        "FID_DIV_CLS_CODE": "0",
        "FID_BLNG_CLS_CODE": "3",          # 거래금액순
        "FID_TRGT_CLS_CODE": "111111111",
        "FID_TRGT_EXLS_CLS_CODE": "0000000000",
        "FID_INPUT_PRICE_1": "",
        "FID_INPUT_PRICE_2": "",
        "FID_VOL_CNT": "100000",
        "FID_INPUT_DATE_1": "",
    }
    try:
        r = requests.get(url1, headers=headers, params=params1, timeout=10).json()
        for item in r.get("output", [])[:30]:
            code = item.get("mksc_shrn_iscd") or item.get("stck_shrn_iscd")
            if code:
                codes.add(code)
        print(f"  [volume-rank KOSDAQ] {len(codes)}종목 확보")
    except Exception as e:
        print(f"  [volume-rank] 실패: {e}")

    # 2) 등락률 순위 — KOSDAQ만, 다양한 범위로 페이지네이션 효과 (max 30)
    # FID_INPUT_ISCD: KOSDAQ = 1002
    # FID_RANK_SORT_CLS_CODE: 0=상승률, 1=하락률, 2=시가대비상승률, 3=시가대비하락률
    # FID_INPUT_CNT_1: 검색결과수 (max 30)
    url2 = f"{client.base_url}/uapi/domestic-stock/v1/ranking/fluctuation"
    headers2 = client._headers("FHPST01700000")
    for sort_cls in ["0", "1"]:  # 상승률, 하락률
        for rate_min, rate_max in [(0.0, 3.0), (3.0, 7.0), (7.0, 15.0), (15.0, 30.0)]:
            params2 = {
                "fid_cond_mrkt_div_code": "J",
                "fid_cond_scr_div_code": "20170",
                "fid_input_iscd": "1002",          # KOSDAQ
                "fid_rank_sort_cls_code": sort_cls,
                "fid_input_cnt_1": "0",
                "fid_prc_cls_code": "0",
                "fid_input_price_1": "1000",
                "fid_input_price_2": "",
                "fid_vol_cnt": "100000",
                "fid_trgt_cls_code": "0",
                "fid_trgt_exls_cls_code": "0",
                "fid_div_cls_code": "0",
                "fid_rsfl_rate1": str(rate_min),
                "fid_rsfl_rate2": str(rate_max),
            }
            try:
                r = requests.get(url2, headers=headers2, params=params2, timeout=10).json()
                before = len(codes)
                for item in r.get("output", [])[:30]:
                    code = item.get("stck_shrn_iscd") or item.get("mksc_shrn_iscd")
                    if code:
                        codes.add(code)
                added = len(codes) - before
                if added:
                    print(f"  [fluct sort={sort_cls} {rate_min}~{rate_max}%] +{added}종목 (총 {len(codes)})")
                time.sleep(0.15)
            except Exception as e:
                print(f"  [fluct] 실패: {e}")
                continue

    return codes


def verify_one(code: str, start: str, end: str) -> dict | None:
    """pykrx 단일 종목 조회로 거래대금/종가 검증."""
    try:
        df = stock.get_market_ohlcv_by_date(start, end, code)
    except Exception:
        return None
    if df is None or df.empty or "종가" not in df.columns:
        return None
    df = df[df["거래량"] > 0]
    if df.empty:
        return None
    df["value"] = df["종가"].astype(float) * df["거래량"].astype(float)
    avg_value = float(df["value"].mean())
    last_close = float(df["종가"].iloc[-1])
    if avg_value < MIN_AVG_VALUE or last_close < MIN_PRICE:
        return None
    try:
        name = stock.get_market_ticker_name(code)
    except Exception:
        name = code
    return {
        "ticker": f"{code}.KQ",
        "code": code,
        "market": "KOSDAQ",
        "name": name,
        "avg_value_krw": int(avg_value),
        "last_close": int(last_close),
        "n_days": int(len(df)),
    }


def main() -> None:
    client = KISClient()
    print(f"[kosdaq] KISClient 인증 OK")

    print("[kosdaq] KIS 순위 API에서 KOSDAQ 후보 수집...")
    cands = fetch_kosdaq_candidates(client)
    print(f"[kosdaq] 후보 {len(cands)}종목")

    # 기존 universe.csv에서 이미 있는 KOSDAQ 코드 제외 (재검증 안 함)
    df_existing = pd.read_csv(UNIVERSE_CSV)
    existing_codes = set(df_existing["code"].astype(str).str.zfill(6).tolist())
    new_cands = [c for c in cands if c not in existing_codes]
    print(f"[kosdaq] 기존 universe 제외 후 신규 후보 {len(new_cands)}종목")

    # pykrx 검증
    today = datetime.now()
    end = today.strftime("%Y%m%d")
    start = (today - timedelta(days=LOOKBACK_DAYS)).strftime("%Y%m%d")
    print(f"[kosdaq] pykrx 검증 기간: {start} ~ {end}")

    rows: list[dict] = []
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futs = {ex.submit(verify_one, c, start, end): c for c in new_cands}
        done = 0
        for fut in as_completed(futs):
            done += 1
            r = fut.result()
            if r:
                rows.append(r)
    print(f"[kosdaq] 통과 {len(rows)}종목 (elapsed {time.time()-t0:.1f}s)")

    if not rows:
        print("[kosdaq] 추가할 종목 없음. 종료.")
        return

    df_new = pd.DataFrame(rows)
    df_all = pd.concat([df_existing, df_new], ignore_index=True)
    df_all = df_all.drop_duplicates(subset=["ticker"]).sort_values("avg_value_krw", ascending=False).reset_index(drop=True)
    df_all.to_csv(UNIVERSE_CSV, index=False)
    print(f"[kosdaq] universe.csv 업데이트 → 총 {len(df_all)}종목 "
          f"(KOSPI {sum(df_all.market=='KOSPI')}, KOSDAQ {sum(df_all.market=='KOSDAQ')})")
    print("\n신규 추가 KOSDAQ TOP 15:")
    print(df_new.sort_values("avg_value_krw", ascending=False).head(15).to_string(index=False))


if __name__ == "__main__":
    main()
