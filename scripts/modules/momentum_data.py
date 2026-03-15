"""모멘텀 데이터 모듈 (투자자 A, D용)

1주/1월/3월 수익률과 거래량 급증 여부를 계산한다.
A는 모멘텀 상위, D는 낙폭 과대(하위) 종목에 주목.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "core"))
from market import get_stock_history, load_config
from logger import get_logger

logger = get_logger(__name__)


def get_momentum_data(tickers=None):
    """전 종목 모멘텀 데이터

    Returns:
        {
            "005930.KS": {
                "name": "삼성전자",
                "return_1w": 2.5,
                "return_1m": -3.1,
                "return_3m": 15.2,
                "volume_ratio": 1.8,
                "volume_surge": False,
                "momentum_rank": 3,
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
            if hist.empty or len(hist) < 5:
                continue

            closes = hist["Close"]
            volumes = hist["Volume"]
            current = float(closes.iloc[-1])
            info = universe.get(ticker, {})

            # 1주 수익률
            idx_1w = min(5, len(closes) - 1)
            return_1w = round((current / float(closes.iloc[-idx_1w - 1]) - 1) * 100, 2)

            # 1월 수익률
            idx_1m = min(21, len(closes) - 1)
            return_1m = round((current / float(closes.iloc[-idx_1m - 1]) - 1) * 100, 2)

            # 3월 수익률
            return_3m = round((current / float(closes.iloc[0]) - 1) * 100, 2)

            # 거래량 비율 (당일 / 20일 평균)
            vol_20d_avg = float(volumes.tail(20).mean()) if len(volumes) >= 20 else float(volumes.mean())
            latest_vol = float(volumes.iloc[-1])
            volume_ratio = round(latest_vol / vol_20d_avg, 2) if vol_20d_avg > 0 else 0

            results[ticker] = {
                "name": info.get("name", ticker),
                "return_1w": return_1w,
                "return_1m": return_1m,
                "return_3m": return_3m,
                "volume_ratio": volume_ratio,
                "volume_surge": volume_ratio > 2.0,
            }
        except Exception as e:
            logger.error(f"{ticker} 모멘텀: {e}")

    # 모멘텀 순위 (1주 수익률 기준 내림차순)
    sorted_tickers = sorted(results.keys(), key=lambda t: results[t]["return_1w"], reverse=True)
    for rank, ticker in enumerate(sorted_tickers, 1):
        results[ticker]["momentum_rank"] = rank

    return results


def format_momentum_text(data):
    """모멘텀 데이터를 텍스트로 포맷 (Claude 에이전트 전달용)"""
    sorted_items = sorted(data.items(), key=lambda x: x[1]["momentum_rank"])
    lines = []
    for ticker, d in sorted_items:
        surge = " [거래량 급증]" if d["volume_surge"] else ""
        lines.append(
            f"#{d['momentum_rank']} {ticker} ({d['name']}): "
            f"1주 {d['return_1w']:+.1f}% | 1월 {d['return_1m']:+.1f}% | "
            f"3월 {d['return_3m']:+.1f}% | 거래량비 {d['volume_ratio']:.1f}x{surge}"
        )
    return "\n".join(lines)


if __name__ == "__main__":
    print("모멘텀 데이터를 계산합니다...\n")
    data = get_momentum_data()
    print(format_momentum_text(data))
    surge_count = sum(1 for d in data.values() if d["volume_surge"])
    print(f"\n총 {len(data)}종목 분석 완료 (거래량 급증: {surge_count}종목)")
