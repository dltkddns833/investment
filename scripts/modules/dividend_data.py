"""배당 데이터 모듈 (투자자 I, C용)

yfinance에서 배당수익률을 조회하고, 데이터가 없는 종목은
config.stock_universe의 정적 값을 fallback으로 사용한다.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "core"))
import yfinance as yf
from market import load_config


def get_dividend_data(tickers=None):
    """전 종목 배당 데이터 조회

    Returns:
        {
            "005930.KS": {
                "name": "삼성전자",
                "dividend_yield": 2.1,
                "has_data": True,
                "source": "yfinance",
            }, ...
        }
    """
    config = load_config()
    universe = {s["ticker"]: s for s in config["stock_universe"]}

    if tickers is None:
        tickers = list(universe.keys())

    results = {}
    for ticker in tickers:
        info = universe.get(ticker, {})
        name = info.get("name", ticker)

        try:
            stock = yf.Ticker(ticker)
            yf_info = stock.info
            dividend_yield = yf_info.get("dividendYield")

            if dividend_yield and dividend_yield > 0:
                results[ticker] = {
                    "name": name,
                    "dividend_yield": round(dividend_yield * 100, 2),
                    "has_data": True,
                    "source": "yfinance",
                }
                continue
        except Exception:
            pass

        # fallback: config.stock_universe에 dividend_yield 필드가 있으면 사용
        static_yield = info.get("dividend_yield")
        if static_yield and static_yield > 0:
            results[ticker] = {
                "name": name,
                "dividend_yield": static_yield,
                "has_data": True,
                "source": "static",
            }
        else:
            results[ticker] = {
                "name": name,
                "dividend_yield": 0,
                "has_data": False,
                "source": "none",
            }

    return results


def format_dividend_text(data):
    """배당 데이터를 텍스트로 포맷 (Claude 에이전트 전달용)"""
    sorted_items = sorted(data.items(), key=lambda x: x[1]["dividend_yield"], reverse=True)
    lines = []
    for ticker, d in sorted_items:
        status = f"{d['dividend_yield']}%" if d["has_data"] else "데이터 없음"
        lines.append(f"{ticker} ({d['name']}): 배당수익률 {status} [{d['source']}]")
    return "\n".join(lines)


if __name__ == "__main__":
    print("배당 데이터를 조회합니다...\n")
    data = get_dividend_data()
    print(format_dividend_text(data))
    has_data_count = sum(1 for d in data.values() if d["has_data"])
    print(f"\n총 {len(data)}종목 중 {has_data_count}종목 배당 데이터 확보")
