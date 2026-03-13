"""외국인/기관 수급 데이터 모듈 (투자자 J용)

네이버 금융에서 외국인/기관 순매매량을 크롤링한다.
실패 시 빈 데이터로 폴백 (J 투자자는 뉴스 기반 수급 판단 병행).
"""
import sys
import os
import re
import requests
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "core"))
from market import load_config

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


def _fetch_flow(code):
    """네이버 금융에서 종목의 최근 5일 외국인/기관 순매매량을 가져온다.

    Returns:
        (foreign_net_5d, institutional_net_5d, foreign_ownership_pct, latest_foreign_net, latest_institutional_net)
        실패 시 None
    """
    url = f"https://finance.naver.com/item/frgn.naver?code={code}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=8)
        resp.raise_for_status()
    except Exception:
        return None

    soup = BeautifulSoup(resp.text, "html.parser")

    # 두 번째 테이블: 날짜별 기관/외국인 순매매량
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
        # cols: 날짜, 종가, 전일비, 등락률, 거래량, 기관순매매, 외국인순매매, 보유주수, 보유율
        try:
            inst_net = _parse_number(cols[5].get_text(strip=True))
            foreign_net = _parse_number(cols[6].get_text(strip=True))
        except (IndexError, ValueError):
            continue

        if count == 0:
            latest_foreign = foreign_net
            latest_inst = inst_net
            # 보유율
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


def get_institutional_flow(tickers=None):
    """전 종목 외국인/기관 순매수 데이터 (네이버 금융 크롤링)

    Returns:
        {
            "005930.KS": {
                "name": "삼성전자",
                "foreign_net_5d": 12345,       # 최근 5일 외국인 순매수 합계 (주)
                "institutional_net_5d": -6789,  # 최근 5일 기관 순매수 합계 (주)
                "foreign_net_today": 5000,      # 당일 외국인 순매수 (주)
                "institutional_net_today": -2000, # 당일 기관 순매수 (주)
                "foreign_ownership_pct": 49.66, # 외국인 보유율 (%)
                "data_available": True,
            }, ...
        }
    """
    if tickers is None:
        config = load_config()
        tickers = [s["ticker"] for s in config["stock_universe"]]
        universe = {s["ticker"]: s for s in config["stock_universe"]}
    else:
        config = load_config()
        universe = {s["ticker"]: s for s in config["stock_universe"]}

    results = {}
    for ticker in tickers:
        name = universe.get(ticker, {}).get("name", ticker)
        # .KS / .KQ 접미사 제거하여 네이버 금융 코드로 변환
        code = re.sub(r"\.(KS|KQ)$", "", ticker)

        flow = _fetch_flow(code)
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
