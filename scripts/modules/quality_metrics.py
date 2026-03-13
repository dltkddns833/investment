"""종목 품질 지표 모듈 (투자자 C용)

변동성, 시가총액 티어 등 안정성 지표를 계산한다.
C는 변동성 낮고 시총 큰 우량주를 선호.
"""
import sys
import os
import math
import yfinance as yf
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "core"))
from market import get_stock_history, load_config


def get_quality_metrics(tickers=None):
    """종목 품질 지표

    Returns:
        {
            "005930.KS": {
                "name": "삼성전자",
                "volatility_20d": 18.5,
                "volatility_tier": "low",
                "market_cap_tier": "large",
                "stability_score": 8.5,
            }, ...
        }
    """
    config = load_config()
    universe = {s["ticker"]: s for s in config["stock_universe"]}

    if tickers is None:
        tickers = list(universe.keys())

    results = {}
    for ticker in tickers:
        try:
            hist = get_stock_history(ticker, period="3mo")
            if hist.empty or len(hist) < 20:
                continue

            closes = hist["Close"]
            info = universe.get(ticker, {})

            # 20일 변동성 (일간 수익률 표준편차 -> 연환산)
            daily_returns = closes.pct_change().dropna().tail(20)
            volatility_20d = round(float(daily_returns.std()) * math.sqrt(252) * 100, 1)

            # 변동성 티어
            if volatility_20d < 25:
                volatility_tier = "low"
            elif volatility_20d < 40:
                volatility_tier = "medium"
            else:
                volatility_tier = "high"

            # 시가총액 티어 (yfinance에서 동적 조회)
            try:
                market_cap = yf.Ticker(ticker).fast_info.get("marketCap", 0) or 0
                if market_cap >= 10_000_000_000_000:  # 10조원 이상
                    market_cap_tier = "large"
                elif market_cap >= 1_000_000_000_000:  # 1조원 이상
                    market_cap_tier = "mid"
                else:
                    market_cap_tier = "small"
            except Exception:
                market_cap_tier = info.get("market_cap_tier", "mid")

            # 안정성 점수 (10점 만점)
            # 변동성 점수: low=4, medium=2, high=0
            vol_score = {"low": 4, "medium": 2, "high": 0}[volatility_tier]
            # 시총 점수: large=4, mid=2, small=0
            cap_score = {"large": 4, "mid": 2, "small": 0}.get(market_cap_tier, 2)
            # 최근 하락 방어: 최근 1월 MDD가 낮을수록 높은 점수 (0~2점)
            idx_1m = min(21, len(closes) - 1)
            recent_closes = closes.tail(idx_1m + 1)
            peak = recent_closes.cummax()
            drawdown = ((recent_closes - peak) / peak * 100).min()
            mdd_score = max(0, min(2, round(2 + float(drawdown) / 10, 1)))

            stability_score = round(vol_score + cap_score + mdd_score, 1)

            results[ticker] = {
                "name": info.get("name", ticker),
                "volatility_20d": volatility_20d,
                "volatility_tier": volatility_tier,
                "market_cap_tier": market_cap_tier,
                "stability_score": stability_score,
            }
        except Exception as e:
            print(f"[오류] {ticker} 품질 지표: {e}")

    return results


def format_quality_text(data):
    """품질 지표를 텍스트로 포맷 (Claude 에이전트 전달용)"""
    sorted_items = sorted(data.items(), key=lambda x: x[1]["stability_score"], reverse=True)
    lines = []
    for ticker, d in sorted_items:
        lines.append(
            f"{ticker} ({d['name']}): "
            f"안정성 {d['stability_score']}/10 | "
            f"변동성 {d['volatility_20d']}%({d['volatility_tier']}) | "
            f"시총 {d['market_cap_tier']}"
        )
    return "\n".join(lines)


if __name__ == "__main__":
    print("종목 품질 지표를 계산합니다...\n")
    data = get_quality_metrics()
    print(format_quality_text(data))
    low_vol = sum(1 for d in data.values() if d["volatility_tier"] == "low")
    print(f"\n총 {len(data)}종목 분석 완료 (저변동성: {low_vol}종목)")
