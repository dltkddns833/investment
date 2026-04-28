"""외국인/기관 수급 데이터 모듈 (투자자 J용)

데이터 소스 우선순위:
1. Supabase 당일 캐시
2. pykrx (KRX 데이터, 최대 2회 retry)
3. 네이버 금융 스크래핑 (최대 2회 retry, User-Agent 다양화)
4. Supabase 직전 영업일 캐시 (stale fallback)

호출 결과는 60초 메모리 캐시로 중복 호출 방지.
모든 종목 실패 시 텔레그램 알림 (30분 쿨다운).
"""
import sys
import os
import re
import time
import random
from datetime import datetime, timedelta

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "core"))
from market import load_config
from logger import get_logger
from supabase_client import supabase

logger = get_logger(__name__)

USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]


def _headers():
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://finance.naver.com/",
    }


HEADERS = {"User-Agent": USER_AGENTS[0]}  # backward-compat

_MEM_CACHE = {}  # (date_str, tuple_tickers) -> (timestamp, results)


def _parse_number(text):
    """'+1,234' / '-567' 형태의 문자열을 int로 변환"""
    text = text.replace(",", "").replace("+", "").strip()
    if not text or text == "0":
        return 0
    try:
        return int(text)
    except ValueError:
        return 0


_PYKRX_LOGGED_FAIL = False


def _fetch_via_pykrx(code, date_str, retries=2):
    """pykrx로 종목의 최근 5일 외국인/기관 순매매량을 가져온다.

    Returns:
        (foreign_net_5d, institutional_net_5d, foreign_ownership_pct,
         latest_foreign_net, latest_institutional_net) 또는 None
    """
    global _PYKRX_LOGGED_FAIL
    try:
        from pykrx import stock
    except ImportError:
        logger.warning("pykrx 미설치 — fallback으로 전환")
        return None

    last_err = None
    for attempt in range(retries + 1):
        try:
            end_date = date_str.replace("-", "")
            start_dt = datetime.strptime(date_str, "%Y-%m-%d") - timedelta(days=25)
            start_date = start_dt.strftime("%Y%m%d")

            df = stock.get_market_trading_volume_by_date(start_date, end_date, code)
            if df is None or df.empty:
                return None

            df = df.tail(5)
            if len(df) == 0:
                return None

            foreign_col = "외국인" if "외국인" in df.columns else None
            inst_col = "기관합계" if "기관합계" in df.columns else None

            if foreign_col is None or inst_col is None:
                return None

            foreign_net_5d = int(df[foreign_col].sum())
            inst_net_5d = int(df[inst_col].sum())
            latest_foreign = int(df[foreign_col].iloc[-1])
            latest_inst = int(df[inst_col].iloc[-1])

            foreign_pct = None
            try:
                exhaust = stock.get_exhaustion_rates_of_foreign_investment(end_date, end_date, code)
                if exhaust is not None and not exhaust.empty:
                    if "지분율" in exhaust.columns:
                        foreign_pct = float(exhaust["지분율"].iloc[0])
                    elif "보유비중" in exhaust.columns:
                        foreign_pct = float(exhaust["보유비중"].iloc[0])
            except Exception:
                pass

            return (foreign_net_5d, inst_net_5d, foreign_pct, latest_foreign, latest_inst)
        except Exception as e:
            last_err = e
            if attempt < retries:
                time.sleep(0.5 * (attempt + 1))

    if not _PYKRX_LOGGED_FAIL:
        logger.warning(f"pykrx 조회 실패({code}) — naver fallback으로 전환: {last_err}")
        _PYKRX_LOGGED_FAIL = True
    else:
        logger.debug(f"pykrx 조회 실패 ({code}): {last_err}")
    return None


_NAVER_LOGGED_FAIL = False


def _fetch_via_naver(code, retries=2):
    """네이버 금융에서 종목의 최근 5일 외국인/기관 순매매량을 가져온다.

    Returns:
        (foreign_net_5d, institutional_net_5d, foreign_ownership_pct,
         latest_foreign_net, latest_institutional_net) 또는 None
    """
    global _NAVER_LOGGED_FAIL
    url = f"https://finance.naver.com/item/frgn.naver?code={code}"

    resp = None
    last_err = None
    for attempt in range(retries + 1):
        try:
            resp = requests.get(url, headers=_headers(), timeout=12)
            resp.raise_for_status()
            break
        except Exception as e:
            last_err = e
            resp = None
            if attempt < retries:
                time.sleep(0.5 * (attempt + 1))

    if resp is None:
        if not _NAVER_LOGGED_FAIL:
            logger.warning(f"네이버 수급 조회 실패({code}) — stale 캐시 fallback 시도: {last_err}")
            _NAVER_LOGGED_FAIL = True
        else:
            logger.debug(f"네이버 수급 조회 실패 ({code}): {last_err}")
        return None

    soup = BeautifulSoup(resp.text, "html.parser")
    tables = soup.select("table.type2")
    if len(tables) < 2:
        return None

    rows = tables[1].select("tr")
    foreign_total = 0
    inst_total = 0
    latest_foreign = 0
    latest_inst = 0
    foreign_pct = None
    count = 0

    for row in rows:
        cols = row.select("td")
        if len(cols) < 9:
            continue
        try:
            inst_net = _parse_number(cols[5].get_text(strip=True))
            foreign_net = _parse_number(cols[6].get_text(strip=True))
        except (IndexError, ValueError):
            continue

        if count == 0:
            latest_foreign = foreign_net
            latest_inst = inst_net
            pct_text = cols[8].get_text(strip=True).replace("%", "")
            try:
                foreign_pct = float(pct_text)
            except ValueError:
                pass

        foreign_total += foreign_net
        inst_total += inst_net
        count += 1
        if count >= 5:
            break

    if count == 0:
        return None

    return (foreign_total, inst_total, foreign_pct, latest_foreign, latest_inst)


def _load_from_cache(date_str, tickers):
    """Supabase에서 캐시 로드. 전체 종목이 있으면 dict 반환, 아니면 None."""
    try:
        result = supabase.table("institutional_flows") \
            .select("*") \
            .eq("date", date_str) \
            .in_("ticker", tickers) \
            .execute()
        if not result.data or len(result.data) < len(tickers):
            return None

        cache = {}
        for row in result.data:
            cache[row["ticker"]] = {
                "name": row.get("name", row["ticker"]),
                "foreign_net_5d": row.get("foreign_net_5d"),
                "institutional_net_5d": row.get("institutional_net_5d"),
                "foreign_net_today": row.get("foreign_net_today"),
                "institutional_net_today": row.get("institutional_net_today"),
                "foreign_ownership_pct": row.get("foreign_ownership_pct"),
                "data_available": True,
            }
        return cache
    except Exception as e:
        logger.debug(f"캐시 로드 실패: {e}")
        return None


def _load_stale_fallback(date_str, tickers, lookback_days=7):
    """직전 영업일 ~ N일 전 캐시에서 종목별로 가장 최근 row 회수 (stale fallback)."""
    try:
        start = (datetime.strptime(date_str, "%Y-%m-%d") - timedelta(days=lookback_days)).strftime("%Y-%m-%d")
        result = supabase.table("institutional_flows") \
            .select("*") \
            .gte("date", start) \
            .lt("date", date_str) \
            .in_("ticker", tickers) \
            .order("date", desc=True) \
            .execute()
        if not result.data:
            return {}
        latest = {}
        for row in result.data:
            t = row["ticker"]
            if t not in latest:
                latest[t] = row
        return latest
    except Exception as e:
        logger.debug(f"stale 캐시 로드 실패: {e}")
        return {}


def _save_to_cache(date_str, results, data_source):
    """결과를 Supabase에 캐시 저장 (stale 회수 항목은 제외)"""
    rows = []
    for ticker, d in results.items():
        if not d.get("data_available"):
            continue
        if d.get("stale_date"):
            continue
        rows.append({
            "date": date_str,
            "ticker": ticker,
            "name": d.get("name"),
            "foreign_net_5d": d.get("foreign_net_5d"),
            "institutional_net_5d": d.get("institutional_net_5d"),
            "foreign_net_today": d.get("foreign_net_today"),
            "institutional_net_today": d.get("institutional_net_today"),
            "foreign_ownership_pct": d.get("foreign_ownership_pct"),
            "data_source": data_source,
            "collected_at": datetime.now().isoformat(),
        })
    if rows:
        try:
            supabase.table("institutional_flows").upsert(rows).execute()
            logger.info(f"수급 데이터 {len(rows)}건 캐시 저장 ({data_source})")
        except Exception as e:
            logger.warning(f"캐시 저장 실패: {e}")


_LAST_NOTIFY_TS = 0


def _notify_failure(error_count, total, stale_recovered=0):
    """수급 데이터 조회 실패 시 텔레그램 알림.

    - 100% 실패: 항상 알림 (소량 호출 포함)
    - 50% 이상 실패 + total ≥ 20: 알림
    - 30분 쿨다운으로 폭주 방지
    """
    global _LAST_NOTIFY_TS
    is_total_outage = error_count == total and total > 0
    is_partial_outage = total >= 20 and error_count >= total * 0.5
    if not (is_total_outage or is_partial_outage):
        return
    now = time.time()
    if now - _LAST_NOTIFY_TS < 1800:
        return
    _LAST_NOTIFY_TS = now
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "notifications"))
        from send_telegram import send_telegram
        suffix = f" (stale {stale_recovered}종목 복구)" if stale_recovered else ""
        msg = f"⚠️ [수급 데이터] {total}종목 중 {error_count}종목 조회 실패{suffix}"
        send_telegram(msg)
    except Exception as e:
        logger.warning(f"알림 발송 실패: {e}")


_TICKER_RE = re.compile(r"^\d{6}\.(KS|KQ)$")


def _validate_tickers(tickers):
    """tickers 입력 정규화 + 형식 검증.

    허용: list/tuple of valid ticker strings, 또는 단일 string (자동 list화).
    거부: dict, set, ticker 형식 불일치 → ValueError.
    """
    if isinstance(tickers, str):
        tickers = [tickers]
    elif isinstance(tickers, (list, tuple)):
        tickers = list(tickers)
    else:
        raise ValueError(
            f"tickers는 list/tuple 또는 단일 string이어야 합니다. "
            f"입력 타입: {type(tickers).__name__}"
        )
    if not tickers:
        raise ValueError("tickers가 비어 있습니다.")
    bad = [t for t in tickers if not isinstance(t, str) or not _TICKER_RE.match(t)]
    if bad:
        raise ValueError(
            f"잘못된 ticker 형식 (예상: '005930.KS' 형태). 문제 항목: {bad[:5]}"
        )
    return tickers


def get_institutional_flow(tickers=None, date_str=None):
    """전 종목 외국인/기관 순매수 데이터

    Fallback chain: 메모리 캐시 → Supabase 당일 캐시 → pykrx(retry) → 네이버(retry) → stale 캐시

    Args:
        tickers: list[str] of '005930.KS' 형식 ticker. None이면 universe 전체.
                 단일 string 전달 시 자동으로 [string]으로 변환.
        date_str: 'YYYY-MM-DD' (None이면 오늘).

    Raises:
        ValueError: tickers 타입이 list/string이 아니거나 형식이 깨졌을 때.

    Example:
        >>> get_institutional_flow(['005930.KS', '000660.KS'])
        >>> get_institutional_flow('005930.KS', '2026-04-28')

    Returns:
        {
            "005930.KS": {
                "name": "삼성전자",
                "foreign_net_5d": 12345,
                "institutional_net_5d": -6789,
                "foreign_net_today": 5000,
                "institutional_net_today": -2000,
                "foreign_ownership_pct": 49.66,
                "data_available": True,
                "stale_date": "2026-04-27",  # stale fallback일 때만 존재
            }, ...
        }
    """
    if date_str is None:
        date_str = datetime.now().strftime("%Y-%m-%d")

    config = load_config()
    universe = {s["ticker"]: s for s in config["stock_universe"]}
    if tickers is None:
        tickers = list(universe.keys())
    else:
        tickers = _validate_tickers(tickers)

    # 0. 동일 호출 메모리 캐시 (60초 TTL, 같은 프로세스 내 중복 호출 방지)
    mem_key = (date_str, tuple(sorted(tickers)))
    now = time.time()
    cached_mem = _MEM_CACHE.get(mem_key)
    if cached_mem and now - cached_mem[0] < 60:
        logger.debug(f"수급 데이터 메모리 캐시 히트: {len(cached_mem[1])}종목")
        return cached_mem[1]

    # 1. Supabase 당일 캐시 확인
    cached = _load_from_cache(date_str, tickers)
    if cached is not None:
        logger.info(f"수급 데이터 캐시 히트: {len(cached)}종목")
        _MEM_CACHE[mem_key] = (now, cached)
        return cached

    # 2. pykrx → naver fallback (각 종목별로 retry 포함)
    results = {}
    pykrx_success = 0
    naver_success = 0
    fail_tickers = []

    for ticker in tickers:
        name = universe.get(ticker, {}).get("name", ticker)
        code = re.sub(r"\.(KS|KQ)$", "", ticker)

        flow = _fetch_via_pykrx(code, date_str)
        source = "pykrx"

        if flow is None:
            flow = _fetch_via_naver(code)
            source = "naver"

        if flow is None:
            results[ticker] = {
                "name": name,
                "foreign_net_5d": None,
                "institutional_net_5d": None,
                "foreign_net_today": None,
                "institutional_net_today": None,
                "foreign_ownership_pct": None,
                "data_available": False,
            }
            fail_tickers.append(ticker)
        else:
            f5d, i5d, fpct, f_today, i_today = flow
            results[ticker] = {
                "name": name,
                "foreign_net_5d": f5d,
                "institutional_net_5d": i5d,
                "foreign_net_today": f_today,
                "institutional_net_today": i_today,
                "foreign_ownership_pct": fpct,
                "data_available": True,
            }
            if source == "pykrx":
                pykrx_success += 1
            else:
                naver_success += 1

    # 3. 실패 종목 stale fallback (직전 영업일 ~ 7일 전 캐시 사용)
    stale_recovered = 0
    if fail_tickers:
        stale = _load_stale_fallback(date_str, fail_tickers)
        for t, row in stale.items():
            results[t] = {
                "name": row.get("name", universe.get(t, {}).get("name", t)),
                "foreign_net_5d": row.get("foreign_net_5d"),
                "institutional_net_5d": row.get("institutional_net_5d"),
                "foreign_net_today": row.get("foreign_net_today"),
                "institutional_net_today": row.get("institutional_net_today"),
                "foreign_ownership_pct": row.get("foreign_ownership_pct"),
                "data_available": True,
                "stale_date": row.get("date"),
            }
            stale_recovered += 1

    fail_count = len(fail_tickers) - stale_recovered
    logger.info(
        f"수급 데이터 조회 완료: pykrx {pykrx_success} / naver {naver_success} / "
        f"stale {stale_recovered} / 실패 {fail_count}"
    )

    # 캐시 저장 (당일 신선 데이터만)
    if pykrx_success + naver_success > 0:
        primary_source = "pykrx" if pykrx_success >= naver_success else "naver"
        _save_to_cache(date_str, results, primary_source)

    # 실패 알림
    if fail_count > 0:
        _notify_failure(fail_count, len(tickers), stale_recovered=stale_recovered)

    _MEM_CACHE[mem_key] = (time.time(), results)
    return results


def format_flow_text(data):
    """수급 데이터를 텍스트로 포맷 (Claude 에이전트 전달용)"""
    lines = []
    for ticker, d in data.items():
        if not d["data_available"]:
            lines.append(f"{ticker} ({d['name']}): 데이터 없음")
            continue

        f5d = f"{d['foreign_net_5d']:+,}" if d['foreign_net_5d'] is not None else "N/A"
        i5d = f"{d['institutional_net_5d']:+,}" if d['institutional_net_5d'] is not None else "N/A"
        f_today = f"{d['foreign_net_today']:+,}" if d['foreign_net_today'] is not None else "N/A"
        i_today = f"{d['institutional_net_today']:+,}" if d['institutional_net_today'] is not None else "N/A"
        fpct = f"{d['foreign_ownership_pct']:.1f}%" if d['foreign_ownership_pct'] is not None else "N/A"

        lines.append(
            f"{ticker} ({d['name']}): "
            f"외국인 5일 {f5d}주 (당일 {f_today}주) | "
            f"기관 5일 {i5d}주 (당일 {i_today}주) | "
            f"외국인 보유율 {fpct}"
        )
    return "\n".join(lines)


if __name__ == "__main__":
    print("외국인/기관 수급 데이터를 조회합니다...\n")
    data = get_institutional_flow()
    print(format_flow_text(data))

    available = sum(1 for d in data.values() if d["data_available"])
    print(f"\n총 {len(data)}종목 중 {available}종목 데이터 수집 완료")
