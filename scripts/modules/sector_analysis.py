"""섹터 분석 모듈 (투자자 B, F용)

섹터별 평균 수익률과 순위를 계산한다.
B는 섹터 균형 배분, F는 상위 섹터 집중에 활용.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "core"))
from market import get_stock_history, load_config


def get_sector_analysis(tickers=None):
    """섹터별 성과 분석

    Returns:
        {
            "sectors": {
                "반도체": {
                    "avg_return_1d": 1.2,
                    "avg_return_1w": 3.5,
                    "avg_return_1m": -2.1,
                    "rank": 1,
                    "stocks": ["005930.KS", "000660.KS"],
                    "stock_count": 2,
                }, ...
            },
            "stocks": {
                "005930.KS": {
                    "name": "삼성전자",
                    "sector": "반도체",
                    "return_1d": 1.5,
                    "return_1w": 4.2,
                    "return_1m": -1.0,
                    "sector_rank": 1,
                    "relative_strength": 0.8,
                }, ...
            }
        }
    """
    config = load_config()
    universe = {s["ticker"]: s for s in config["stock_universe"]}

    if tickers is None:
        tickers = list(universe.keys())

    # 종목별 수익률 계산
    stock_data = {}
    for ticker in tickers:
        try:
            hist = get_stock_history(ticker, period="3mo")
            if hist.empty or len(hist) < 2:
                continue

            closes = hist["Close"]
            current = float(closes.iloc[-1])
            info = universe.get(ticker, {})
            sector = info.get("sector", "기타")

            # 1일 수익률
            prev = float(closes.iloc[-2])
            return_1d = round((current / prev - 1) * 100, 2)

            # 1주 수익률
            idx_1w = min(5, len(closes) - 1)
            return_1w = round((current / float(closes.iloc[-idx_1w - 1]) - 1) * 100, 2)

            # 1월 수익률
            idx_1m = min(21, len(closes) - 1)
            return_1m = round((current / float(closes.iloc[-idx_1m - 1]) - 1) * 100, 2)

            stock_data[ticker] = {
                "name": info.get("name", ticker),
                "sector": sector,
                "return_1d": return_1d,
                "return_1w": return_1w,
                "return_1m": return_1m,
            }
        except Exception as e:
            print(f"[오류] {ticker} 섹터 분석: {e}")

    # 섹터별 그룹핑 & 평균 계산
    sector_groups = {}
    for ticker, data in stock_data.items():
        sector = data["sector"]
        if sector not in sector_groups:
            sector_groups[sector] = []
        sector_groups[sector].append(ticker)

    sectors = {}
    for sector, sector_tickers in sector_groups.items():
        returns_1d = [stock_data[t]["return_1d"] for t in sector_tickers]
        returns_1w = [stock_data[t]["return_1w"] for t in sector_tickers]
        returns_1m = [stock_data[t]["return_1m"] for t in sector_tickers]

        sectors[sector] = {
            "avg_return_1d": round(sum(returns_1d) / len(returns_1d), 2),
            "avg_return_1w": round(sum(returns_1w) / len(returns_1w), 2),
            "avg_return_1m": round(sum(returns_1m) / len(returns_1m), 2),
            "stocks": sector_tickers,
            "stock_count": len(sector_tickers),
        }

    # 섹터 순위 (1주 평균 수익률 기준)
    sorted_sectors = sorted(sectors.keys(), key=lambda s: sectors[s]["avg_return_1w"], reverse=True)
    for rank, sector in enumerate(sorted_sectors, 1):
        sectors[sector]["rank"] = rank

    # 종목별 섹터 순위 & 상대 강도
    stocks = {}
    for ticker, data in stock_data.items():
        sector = data["sector"]
        sector_avg = sectors[sector]["avg_return_1w"]
        relative_strength = round(data["return_1w"] - sector_avg, 2)

        stocks[ticker] = {
            **data,
            "sector_rank": sectors[sector]["rank"],
            "relative_strength": relative_strength,
        }

    return {"sectors": sectors, "stocks": stocks}


def format_sector_text(data):
    """섹터 분석 결과를 텍스트로 포맷 (Claude 에이전트 전달용)"""
    lines = ["[섹터 순위]"]
    sorted_sectors = sorted(data["sectors"].items(), key=lambda x: x[1]["rank"])
    for sector, s in sorted_sectors:
        lines.append(
            f"#{s['rank']} {sector} ({s['stock_count']}종목): "
            f"1일 {s['avg_return_1d']:+.1f}% | 1주 {s['avg_return_1w']:+.1f}% | "
            f"1월 {s['avg_return_1m']:+.1f}%"
        )

    lines.append("\n[종목별 섹터 내 상대 강도]")
    sorted_stocks = sorted(data["stocks"].items(), key=lambda x: x[1]["return_1w"], reverse=True)
    for ticker, s in sorted_stocks:
        lines.append(
            f"{ticker} ({s['name']}) [{s['sector']}]: "
            f"1주 {s['return_1w']:+.1f}% (섹터 대비 {s['relative_strength']:+.1f}%p)"
        )

    return "\n".join(lines)


if __name__ == "__main__":
    print("섹터 분석을 수행합니다...\n")
    data = get_sector_analysis()
    print(format_sector_text(data))
    print(f"\n{len(data['sectors'])}개 섹터, {len(data['stocks'])}종목 분석 완료")
