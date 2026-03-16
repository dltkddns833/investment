"""외국인/기관 수급 데이터 모듈 (투자자 J용)

데이터 소스 우선순위:
1. Supabase 캐시 (당일 데이터 존재 시)
2. pykrx (KRX 데이터)
3. 네이버 금융 스크래핑 (fallback)

실패 시 텔레그램 알림 발송.
"""
import sys
import os
import re
from datetime import datetime, timedelta

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "core"))
from market import load_config
from logger import get_logger
from supabase_client import supabase

logger = get_logger(__name__)

HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}


def _parse_number(text):
    """'+1,234' / '-567' 형태의 문자열을 int로 변환"""
    text = text.replace(",", "").replace("+", "").strip()
    if not text or text == "0":
        return 0
    try:
        return int(text)
    except ValueError:
        return 0


def _fetch_via_pykrx(code, date_str):
    """pykrx로 종목의 최근 5일 외국인/기관 순매매량을 가져온다.

    Returns:
        (foreign_net_5d, institutional_net_5d, foreign_ownership_pct,
         latest_foreign_net, latest_institutional_net) 또는 None
    """
    try:
        from pykrx import stock
    except ImportError:
        logger.warning("pykrx 미설치 — fallback으로 전환")
        return None

    try:
        # 넉넉히 15영업일 전부터 조회하여 최근 5거래일 확보
        end_date = date_str.replace("-", "")
        start_dt = datetime.strptime(date_str, "%Y-%m-%d") - timedelta(days=25)
        start_date = start_dt.strftime("%Y%m%d")

        # 투자자별 순매수량 (수량 기준)
        df = stock.get_market_trading_volume_by_date(start_date, end_date, code)
        if df is None or df.empty:
            return None

        # 최근 5거래일만 사용
        df = df.tail(5)
        if len(df) == 0:
            return None

        # 컬럼: 금융투자, 보험, 투신, 사모, 은행, 기타금융, 연기금, 기관합계, 기타법인, 개인, 외국인, 기타외국인, 전체
        foreign_col = "외국인" if "외국인" in df.columns else None
        inst_col = "기관합계" if "기관합계" in df.columns else None

        if foreign_col is None or inst_col is None:
            return None

        foreign_net_5d = int(df[foreign_col].sum())
        inst_net_5d = int(df[inst_col].sum())
        latest_foreign = int(df[foreign_col].iloc[-1])
        latest_inst = int(df[inst_col].iloc[-1])

        # 외국인 보유율은 별도 조회 시도
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
        logger.debug(f"pykrx 조회 실패 ({code}): {e}")
        return None


def _fetch_via_naver(code):
    """네이버 금융에서 종목의 최근 5일 외국인/기관 순매매량을 가져온다.

    Returns:
        (foreign_net_5d, institutional_net_5d, foreign_ownership_pct,
         latest_foreign_net, latest_institutional_net) 또는 None
    """
    url = f"https://finance.naver.com/item/frgn.naver?code={code}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=8)
        resp.raise_for_status()
    except Exception:
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


def _save_to_cache(date_str, results, data_source):
    """결과를 Supabase에 캐시 저장"""
    rows = []
    for ticker, d in results.items():
        if not d.get("data_available"):
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


def _notify_failure(error_count, total):
    """수급 데이터 조회 실패 시 텔레그램 알림"""
    if error_count < total * 0.5:
        return
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "notifications"))
        from send_telegram import send_telegram
        msg = f"⚠️ [수급 데이터] {total}종목 중 {error_count}종목 조회 실패"
        send_telegram(msg)
    except Exception as e:
        logger.warning(f"알림 발송 실패: {e}")


def get_institutional_flow(tickers=None, date_str=None):
    """전 종목 외국인/기관 순매수 데이터

    Fallback chain: Supabase 캐시 → pykrx → 네이버 스크래핑

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
            }, ...
        }
    """
    if date_str is None:
        date_str = datetime.now().strftime("%Y-%m-%d")

    config = load_config()
    universe = {s["ticker"]: s for s in config["stock_universe"]}
    if tickers is None:
        tickers = list(universe.keys())

    # 1. 캐시 확인
    cached = _load_from_cache(date_str, tickers)
    if cached is not None:
        logger.info(f"수급 데이터 캐시 히트: {len(cached)}종목")
        return cached

    # 2. pykrx → naver fallback
    results = {}
    pykrx_success = 0
    naver_success = 0
    fail_count = 0

    for ticker in tickers:
        name = universe.get(ticker, {}).get("name", ticker)
        code = re.sub(r"\.(KS|KQ)$", "", ticker)

        # pykrx 시도
        flow = _fetch_via_pykrx(code, date_str)
        source = "pykrx"

        # pykrx 실패 시 naver fallback
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
            fail_count += 1
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

    logger.info(f"수급 데이터 조회 완료: pykrx {pykrx_success} / naver {naver_success} / 실패 {fail_count}")

    # 캐시 저장
    if pykrx_success + naver_success > 0:
        primary_source = "pykrx" if pykrx_success >= naver_success else "naver"
        _save_to_cache(date_str, results, primary_source)

    # 실패 알림
    if fail_count > 0:
        _notify_failure(fail_count, len(tickers))

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
