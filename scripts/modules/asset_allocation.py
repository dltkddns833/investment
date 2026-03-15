"""자산배분 데이터 모듈 (투자자 K 로로캅용)

ETF 종목의 카테고리별 현재가, 변동성, 추세, 수익률 정보를 제공한다.
로보어드바이저 방식의 글로벌 자산배분 의사결정을 지원한다.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "core"))
from market import get_stock_history

# ETF 종목 목록 (카테고리별)
ETF_UNIVERSE = {
    "069500.KS": {"name": "KODEX 200", "category": "지수ETF"},
    "229200.KS": {"name": "KODEX 코스닥150", "category": "지수ETF"},
    "091160.KS": {"name": "TIGER 반도체", "category": "섹터ETF"},
    "305720.KS": {"name": "KODEX 2차전지산업", "category": "섹터ETF"},
    "227560.KS": {"name": "TIGER 바이오TOP10", "category": "섹터ETF"},
    "360750.KS": {"name": "TIGER 미국S&P500", "category": "해외ETF"},
    "379810.KS": {"name": "KODEX 미국나스닥100", "category": "해외ETF"},
    "381180.KS": {"name": "TIGER 미국필라델피아반도체", "category": "해외ETF"},
    "148070.KS": {"name": "KODEX 국고채10년", "category": "채권ETF"},
    "319640.KS": {"name": "TIGER 금은선물", "category": "채권ETF"},
    "211560.KS": {"name": "TIGER 배당성장", "category": "배당ETF"},
    "329200.KS": {"name": "TIGER 리츠부동산인프라", "category": "배당ETF"},
}


def get_asset_allocation_data(tickers=None):
    """로로캅(K) 에이전트에게 전달할 자산배분 데이터 반환.

    ETF 종목의 카테고리별 현재가, 변동성, 추세, 수익률 정보 제공.

    Returns:
        {
            "069500.KS": {
                "name": "KODEX 200",
                "category": "지수ETF",
                "current_price": 30000,
                "return_1m": 2.5,
                "return_3m": 5.1,
                "volatility_20d": 12.3,
                "trend": "uptrend",
            }, ...
        }
    """
    if tickers is None:
        tickers = list(ETF_UNIVERSE.keys())

    results = {}
    for ticker in tickers:
        if ticker not in ETF_UNIVERSE:
            continue
        info = ETF_UNIVERSE[ticker]
        try:
            hist = get_stock_history(ticker, period="3mo")
            if hist.empty or len(hist) < 5:
                continue

            closes = hist["Close"]
            current = float(closes.iloc[-1])

            # 1개월 수익률
            idx_1m = min(21, len(closes) - 1)
            return_1m = round((current / float(closes.iloc[-idx_1m - 1]) - 1) * 100, 2)

            # 3개월 수익률
            return_3m = round((current / float(closes.iloc[0]) - 1) * 100, 2)

            # 20일 변동성 (연환산)
            import numpy as np
            if len(closes) >= 20:
                daily_returns = closes.pct_change().dropna().tail(20)
                volatility_20d = round(float(daily_returns.std()) * np.sqrt(252) * 100, 2)
            else:
                daily_returns = closes.pct_change().dropna()
                volatility_20d = round(float(daily_returns.std()) * np.sqrt(252) * 100, 2) if len(daily_returns) > 1 else 0.0

            # 추세 판단 (5일 이동평균 vs 20일 이동평균)
            if len(closes) >= 20:
                ma5 = float(closes.tail(5).mean())
                ma20 = float(closes.tail(20).mean())
                if current > ma5 > ma20:
                    trend = "uptrend"
                elif current < ma5 < ma20:
                    trend = "downtrend"
                else:
                    trend = "sideways"
            else:
                trend = "sideways"

            results[ticker] = {
                "name": info["name"],
                "category": info["category"],
                "current_price": int(current),
                "return_1m": return_1m,
                "return_3m": return_3m,
                "volatility_20d": volatility_20d,
                "trend": trend,
            }
        except Exception as e:
            print(f"[오류] {ticker} 자산배분 데이터: {e}")

    return results


def format_asset_allocation_text(data):
    """자산배분 데이터를 텍스트로 포맷 (Claude 에이전트 전달용)"""
    # 카테고리별 그룹화
    categories = {}
    for ticker, d in data.items():
        cat = d["category"]
        if cat not in categories:
            categories[cat] = []
        categories[cat].append((ticker, d))

    lines = []
    for cat, items in categories.items():
        lines.append(f"\n[{cat}]")
        for ticker, d in items:
            trend_emoji = {"uptrend": "↑", "downtrend": "↓", "sideways": "→"}.get(d["trend"], "→")
            lines.append(
                f"  {ticker} ({d['name']}): "
                f"현재가 {d['current_price']:,}원 | "
                f"1월 {d['return_1m']:+.1f}% | 3월 {d['return_3m']:+.1f}% | "
                f"변동성 {d['volatility_20d']:.1f}% | 추세 {trend_emoji}"
            )
    return "\n".join(lines)


if __name__ == "__main__":
    print("자산배분 ETF 데이터를 계산합니다...\n")
    data = get_asset_allocation_data()
    print(format_asset_allocation_text(data))
    print(f"\n총 {len(data)}개 ETF 분석 완료")
