"""기술적 지표 계산 모듈 (투자자 H용)

RSI, MACD, 볼린저 밴드를 계산하여 매매 신호를 생성한다.
yfinance 히스토리 데이터 + pandas 기본 연산만 사용.
"""
import sys
import os
import pandas as pd
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "core"))
from market import get_stock_history, load_config
from logger import get_logger

logger = get_logger(__name__)


def calculate_rsi(closes, period=14):
    """RSI (Relative Strength Index) 계산"""
    delta = closes.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)

    avg_gain = gain.rolling(window=period, min_periods=period).mean()
    avg_loss = loss.rolling(window=period, min_periods=period).mean()

    rs = avg_gain / avg_loss.replace(0, float('nan'))
    rsi = 100 - (100 / (1 + rs))
    return rsi


def calculate_macd(closes, fast=12, slow=26, signal=9):
    """MACD (Moving Average Convergence Divergence) 계산

    Returns:
        (macd_line, signal_line, histogram)
    """
    ema_fast = closes.ewm(span=fast, adjust=False).mean()
    ema_slow = closes.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def calculate_bollinger_bands(closes, period=20, std_dev=2):
    """볼린저 밴드 계산

    Returns:
        (upper, middle, lower)
    """
    middle = closes.rolling(window=period).mean()
    std = closes.rolling(window=period).std()
    upper = middle + std_dev * std
    lower = middle - std_dev * std
    return upper, middle, lower


def get_technical_signals(tickers=None):
    """전 종목 기술적 신호 계산

    Returns:
        {
            "005930.KS": {
                "rsi": 65.3,
                "rsi_signal": "neutral",
                "macd": 150.2,
                "macd_signal": "bullish",
                "macd_histogram": 50.1,
                "bb_position": 0.7,
                "bb_signal": "upper_band",
                "sma_20": 72000,
                "sma_50": 70500,
                "trend": "uptrend",
                "current_price": 73000,
            }, ...
        }
    """
    if tickers is None:
        config = load_config()
        tickers = [s["ticker"] for s in config["stock_universe"]]

    signals = {}
    for ticker in tickers:
        try:
            hist = get_stock_history(ticker, period="3mo")
            if hist.empty or len(hist) < 30:
                continue

            closes = hist["Close"]
            current_price = int(closes.iloc[-1])

            # RSI
            rsi_series = calculate_rsi(closes)
            rsi_val = round(float(rsi_series.iloc[-1]), 1) if not pd.isna(rsi_series.iloc[-1]) else None

            if rsi_val is not None:
                if rsi_val < 30:
                    rsi_signal = "oversold"
                elif rsi_val > 70:
                    rsi_signal = "overbought"
                else:
                    rsi_signal = "neutral"
            else:
                rsi_signal = "unknown"

            # MACD
            macd_line, signal_line, histogram = calculate_macd(closes)
            macd_val = round(float(macd_line.iloc[-1]), 1)
            macd_hist = round(float(histogram.iloc[-1]), 1)
            prev_hist = float(histogram.iloc[-2]) if len(histogram) >= 2 else 0

            if macd_hist > 0 and prev_hist <= 0:
                macd_signal = "bullish_cross"
            elif macd_hist < 0 and prev_hist >= 0:
                macd_signal = "bearish_cross"
            elif macd_hist > 0:
                macd_signal = "bullish"
            else:
                macd_signal = "bearish"

            # 볼린저 밴드
            bb_upper, bb_middle, bb_lower = calculate_bollinger_bands(closes)
            bb_u = float(bb_upper.iloc[-1])
            bb_l = float(bb_lower.iloc[-1])
            bb_range = bb_u - bb_l if bb_u != bb_l else 1
            bb_position = round((current_price - bb_l) / bb_range, 2)

            if bb_position > 0.8:
                bb_signal = "upper_band"
            elif bb_position < 0.2:
                bb_signal = "lower_band"
            else:
                bb_signal = "middle"

            # 이동평균선
            sma_20 = int(closes.rolling(20).mean().iloc[-1])
            sma_50 = int(closes.rolling(50).mean().iloc[-1]) if len(closes) >= 50 else sma_20

            if current_price > sma_20 > sma_50:
                trend = "uptrend"
            elif current_price < sma_20 < sma_50:
                trend = "downtrend"
            else:
                trend = "sideways"

            signals[ticker] = {
                "current_price": current_price,
                "rsi": rsi_val,
                "rsi_signal": rsi_signal,
                "macd": macd_val,
                "macd_histogram": macd_hist,
                "macd_signal": macd_signal,
                "bb_position": bb_position,
                "bb_signal": bb_signal,
                "sma_20": sma_20,
                "sma_50": sma_50,
                "trend": trend,
            }
        except Exception as e:
            logger.error(f"{ticker} 기술적 지표: {e}")

    return signals


def format_signals_text(signals):
    """기술적 신호를 텍스트로 포맷 (Claude 에이전트 전달용)"""
    lines = []
    for ticker, s in signals.items():
        lines.append(
            f"{ticker}: 현재가 {s['current_price']:,}원 | "
            f"RSI {s['rsi']}({s['rsi_signal']}) | "
            f"MACD {s['macd_signal']}(hist:{s['macd_histogram']}) | "
            f"BB {s['bb_signal']}(pos:{s['bb_position']}) | "
            f"SMA20 {s['sma_20']:,} SMA50 {s['sma_50']:,} | "
            f"추세 {s['trend']}"
        )
    return "\n".join(lines)


if __name__ == "__main__":
    print("기술적 지표를 계산합니다...\n")
    signals = get_technical_signals()
    print(format_signals_text(signals))
    print(f"\n총 {len(signals)}종목 분석 완료")
