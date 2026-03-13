"""외국인/기관 수급 데이터 모듈 (투자자 J용)

현재는 신뢰할 수 있는 무료 데이터 소스가 없어 스텁으로 구현.
뉴스 기반 수급 판단으로 대체하며, 향후 KRX API 또는 네이버 금융 연동 예정.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "core"))
from market import load_config


def get_institutional_flow(tickers=None):
    """전 종목 외국인/기관 순매수 데이터

    NOTE: 현재는 데이터 소스 미연동 상태.
    J 투자자의 Claude 에이전트는 뉴스에서 외국인/기관 수급 동향을 파악하여 판단.

    Returns:
        {
            "005930.KS": {
                "name": "삼성전자",
                "foreign_net": None,
                "institutional_net": None,
                "data_available": False,
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

    return {
        ticker: {
            "name": universe.get(ticker, {}).get("name", ticker),
            "foreign_net": None,
            "institutional_net": None,
            "data_available": False,
        }
        for ticker in tickers
    }


if __name__ == "__main__":
    print("외국인/기관 수급 데이터 모듈 (스텁)")
    print("현재 데이터 소스 미연동 — 뉴스 기반 수급 판단으로 대체\n")
    data = get_institutional_flow()
    for ticker, d in data.items():
        print(f"  {ticker} ({d['name']}): 데이터 없음")
    print(f"\n향후 KRX API 또는 네이버 금융 연동 예정")
