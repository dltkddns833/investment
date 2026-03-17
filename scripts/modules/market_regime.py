"""마켓 레짐 판단 모듈 (투자자 M 오판단용)

KOSPI 지수의 이동평균 크로스, 거래량 추세, 변동성을 분석하여
시장 레짐(bull/bear/neutral)을 판단한다.
"""
import sys
import os
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "core"))
from market import get_stock_history
from logger import get_logger

logger = get_logger(__name__)

# KOSPI 지수 대용: KODEX 200 ETF (^KS11은 yfinance에서 불안정)
KOSPI_PROXY = "069500.KS"


def get_market_regime():
    """KOSPI 기반 마켓 레짐 판단

    Returns:
        {
            "regime": "bull" | "bear" | "neutral",
            "kospi_current": float,
            "kospi_ma20": float,
            "kospi_ma60": float,
            "ma_trend": "golden_cross" | "dead_cross" | "neutral",
            "ma20_slope": float,
            "volume_trend": "increasing" | "decreasing" | "flat",
            "volume_ratio": float,
            "volatility_20d": float,
            "recommended_cash_ratio": float,
            "details": {...}
        }
    """
    try:
        hist = get_stock_history(KOSPI_PROXY, period="6mo")
        if hist.empty or len(hist) < 60:
            logger.warning("KOSPI 데이터 부족, 기본 neutral 반환")
            return _default_regime()

        closes = hist["Close"]
        volumes = hist["Volume"]
        current_price = float(closes.iloc[-1])

        # 1) 이동평균
        ma20 = closes.rolling(20).mean()
        ma60 = closes.rolling(60).mean()
        ma20_val = float(ma20.iloc[-1])
        ma60_val = float(ma60.iloc[-1])

        # MA20 기울기 (최근 5일)
        ma20_slope = float(ma20.iloc[-1] - ma20.iloc[-6]) / ma20.iloc[-6] * 100 if len(ma20) >= 6 else 0

        # MA 크로스 판단
        if ma20_val > ma60_val:
            prev_above = float(ma20.iloc[-2]) > float(ma60.iloc[-2]) if len(ma20) >= 2 else True
            ma_trend = "golden_cross" if not prev_above else "above"
        elif ma20_val < ma60_val:
            prev_below = float(ma20.iloc[-2]) < float(ma60.iloc[-2]) if len(ma20) >= 2 else True
            ma_trend = "dead_cross" if not prev_below else "below"
        else:
            ma_trend = "neutral"

        # MA 신호
        if ma20_val > ma60_val and ma20_slope > 0:
            ma_signal = "bull"
        elif ma20_val < ma60_val and ma20_slope < 0:
            ma_signal = "bear"
        else:
            ma_signal = "neutral"

        # 2) 거래량 추세
        vol_5d = float(volumes.tail(5).mean())
        vol_20d = float(volumes.tail(20).mean())
        volume_ratio = round(vol_5d / vol_20d, 2) if vol_20d > 0 else 1.0

        if volume_ratio > 1.2:
            volume_trend = "increasing"
        elif volume_ratio < 0.8:
            volume_trend = "decreasing"
        else:
            volume_trend = "flat"

        # 3) 변동성 (20일 일간수익률 표준편차, 연환산)
        returns = closes.pct_change().dropna()
        vol_20d_val = float(returns.tail(20).std() * np.sqrt(252) * 100)

        if vol_20d_val > 25:
            vol_signal = "high"
        elif vol_20d_val < 15:
            vol_signal = "low"
        else:
            vol_signal = "moderate"

        # 4) 가격 위치 (현재가 vs MA60)
        price_vs_ma60 = (current_price / ma60_val - 1) * 100

        # 5) 종합 레짐 판단
        bull_score = 0
        if ma_signal == "bull":
            bull_score += 2
        elif ma_signal == "bear":
            bull_score -= 2
        if current_price > ma20_val:
            bull_score += 1
        else:
            bull_score -= 1
        if volume_trend == "increasing" and ma_signal == "bull":
            bull_score += 1
        if vol_signal == "high":
            bull_score -= 1

        if bull_score >= 2:
            regime = "bull"
            recommended_cash = 0.1
        elif bull_score <= -2:
            regime = "bear"
            recommended_cash = 0.7
        else:
            regime = "neutral"
            recommended_cash = 0.4

        result = {
            "regime": regime,
            "kospi_current": round(current_price, 0),
            "kospi_ma20": round(ma20_val, 0),
            "kospi_ma60": round(ma60_val, 0),
            "ma_trend": ma_trend,
            "ma20_slope": round(ma20_slope, 2),
            "volume_trend": volume_trend,
            "volume_ratio": volume_ratio,
            "volatility_20d": round(vol_20d_val, 1),
            "recommended_cash_ratio": recommended_cash,
            "details": {
                "ma_signal": ma_signal,
                "vol_signal": vol_signal,
                "price_vs_ma60": round(price_vs_ma60, 2),
                "bull_score": bull_score,
            },
        }

        logger.info(f"마켓 레짐: {regime} (bull_score={bull_score}, MA20={ma20_val:.0f}, MA60={ma60_val:.0f}, 변동성={vol_20d_val:.1f}%)")
        return result

    except Exception as e:
        logger.error(f"마켓 레짐 판단 실패: {e}")
        return _default_regime()


def _default_regime():
    """데이터 부족 시 기본값"""
    return {
        "regime": "neutral",
        "kospi_current": 0,
        "kospi_ma20": 0,
        "kospi_ma60": 0,
        "ma_trend": "neutral",
        "ma20_slope": 0,
        "volume_trend": "flat",
        "volume_ratio": 1.0,
        "volatility_20d": 0,
        "recommended_cash_ratio": 0.4,
        "details": {
            "ma_signal": "neutral",
            "vol_signal": "moderate",
            "price_vs_ma60": 0,
            "bull_score": 0,
        },
    }


def format_regime_text(data):
    """마켓 레짐을 텍스트로 포맷 (Claude 에이전트 전달용)"""
    regime_kr = {"bull": "강세장", "bear": "약세장", "neutral": "중립"}
    lines = [
        f"=== 마켓 레짐 분석 ===",
        f"판단: {regime_kr.get(data['regime'], data['regime'])} ({data['regime'].upper()})",
        f"KODEX200(KOSPI대용): {data['kospi_current']:,.0f}원",
        f"20일 이평: {data['kospi_ma20']:,.0f}원 (기울기: {data['ma20_slope']:+.2f}%)",
        f"60일 이평: {data['kospi_ma60']:,.0f}원",
        f"MA 크로스: {data['ma_trend']}",
        f"거래량 추세: {data['volume_trend']} (5일/20일 비율: {data['volume_ratio']})",
        f"변동성(20일, 연환산): {data['volatility_20d']:.1f}%",
        f"권장 현금비중: {data['recommended_cash_ratio']*100:.0f}%",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    print("마켓 레짐을 분석합니다...\n")
    regime = get_market_regime()
    print(format_regime_text(regime))
