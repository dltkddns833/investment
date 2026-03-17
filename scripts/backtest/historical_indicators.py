"""백테스트용 과거 지표 계산

캐시된 가격 DataFrame에서 특정 날짜 기준으로 지표를 계산한다.
look-ahead bias 방지를 위해 항상 date 이전 데이터만 사용.
"""
import pandas as pd
import numpy as np


def _slice_to_date(price_df, date, col, ticker):
    """price_df에서 date까지의 특정 종목 종가 시리즈 추출"""
    ts = pd.Timestamp(date)
    series = price_df[(col, ticker)][:ts].dropna()
    return series


def compute_momentum(price_df, date, universe_map):
    """모멘텀 데이터 계산 (momentum_data.py 로직)

    Returns:
        {ticker: {"name", "return_1w", "return_1m", "return_3m", "volume_ratio", "volume_surge", "momentum_rank"}}
    """
    ts = pd.Timestamp(date)
    results = {}

    for ticker in price_df["Close"].columns:
        try:
            closes = price_df[("Close", ticker)][:ts].dropna()
            volumes = price_df[("Volume", ticker)][:ts].dropna()

            if len(closes) < 5:
                continue

            current = float(closes.iloc[-1])
            info = universe_map.get(ticker, {})

            idx_1w = min(5, len(closes) - 1)
            return_1w = round((current / float(closes.iloc[-idx_1w - 1]) - 1) * 100, 2)

            idx_1m = min(21, len(closes) - 1)
            return_1m = round((current / float(closes.iloc[-idx_1m - 1]) - 1) * 100, 2)

            idx_3m = min(63, len(closes) - 1)
            return_3m = round((current / float(closes.iloc[-idx_3m - 1]) - 1) * 100, 2)

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
        except Exception:
            continue

    sorted_tickers = sorted(results.keys(), key=lambda t: results[t]["return_1w"], reverse=True)
    for rank, ticker in enumerate(sorted_tickers, 1):
        results[ticker]["momentum_rank"] = rank

    return results


def _calculate_rsi(closes, period=14):
    """RSI 계산 (technical_indicators.py와 동일)"""
    delta = closes.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)
    avg_gain = gain.rolling(window=period, min_periods=period).mean()
    avg_loss = loss.rolling(window=period, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, float('nan'))
    return 100 - (100 / (1 + rs))


def _calculate_macd(closes, fast=12, slow=26, signal=9):
    """MACD 계산 (technical_indicators.py와 동일)"""
    ema_fast = closes.ewm(span=fast, adjust=False).mean()
    ema_slow = closes.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def compute_technical_signals(price_df, date, tickers=None):
    """기술적 지표 계산 (technical_indicators.py 로직)

    Returns:
        {ticker: {"rsi", "rsi_signal", "macd_signal", "macd_histogram",
                   "bb_position", "bb_signal", "sma_20", "sma_50", "trend", "current_price"}}
    """
    ts = pd.Timestamp(date)
    if tickers is None:
        tickers = price_df["Close"].columns.tolist()

    signals = {}
    for ticker in tickers:
        try:
            closes = price_df[("Close", ticker)][:ts].dropna()
            if len(closes) < 30:
                continue

            current_price = int(closes.iloc[-1])

            # RSI
            rsi_series = _calculate_rsi(closes)
            rsi_val = round(float(rsi_series.iloc[-1]), 1) if not pd.isna(rsi_series.iloc[-1]) else None
            if rsi_val is not None:
                rsi_signal = "oversold" if rsi_val < 30 else ("overbought" if rsi_val > 70 else "neutral")
            else:
                rsi_signal = "unknown"

            # MACD
            macd_line, signal_line, histogram = _calculate_macd(closes)
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
            bb_middle = closes.rolling(20).mean()
            bb_std = closes.rolling(20).std()
            bb_u = float(bb_middle.iloc[-1] + 2 * bb_std.iloc[-1])
            bb_l = float(bb_middle.iloc[-1] - 2 * bb_std.iloc[-1])
            bb_range = bb_u - bb_l if bb_u != bb_l else 1
            bb_position = round((current_price - bb_l) / bb_range, 2)
            bb_signal = "upper_band" if bb_position > 0.8 else ("lower_band" if bb_position < 0.2 else "middle")

            # 이동평균
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
                "macd_histogram": macd_hist,
                "macd_signal": macd_signal,
                "bb_position": bb_position,
                "bb_signal": bb_signal,
                "sma_20": sma_20,
                "sma_50": sma_50,
                "trend": trend,
            }
        except Exception:
            continue

    return signals


def compute_market_regime(price_df, date, kospi_proxy="069500.KS"):
    """KOSPI 레짐 판단 (market_regime.py 로직)

    Args:
        kospi_proxy: KODEX 200 ETF 티커 (KOSPI 프록시)

    Returns:
        "bull", "neutral", "bear"
    """
    ts = pd.Timestamp(date)
    try:
        closes = price_df[("Close", kospi_proxy)][:ts].dropna()
        if len(closes) < 60:
            return "neutral"

        current = float(closes.iloc[-1])
        ma_20 = float(closes.rolling(20).mean().iloc[-1])
        ma_60 = float(closes.rolling(60).mean().iloc[-1])

        # 이평선 배열로 레짐 판단
        if current > ma_20 > ma_60:
            return "bull"
        elif current < ma_20 < ma_60:
            return "bear"
        else:
            return "neutral"
    except Exception:
        return "neutral"


def compute_sector_returns(price_df, date, universe_map):
    """섹터별 평균 수익률 (sector_analysis.py 로직)

    Returns:
        {sector: {"avg_return_1w": float, "tickers": [ticker, ...]}}
    """
    ts = pd.Timestamp(date)
    sector_data = {}

    for ticker, info in universe_map.items():
        sector = info.get("sector", "기타")
        try:
            closes = price_df[("Close", ticker)][:ts].dropna()
            if len(closes) < 5:
                continue
            current = float(closes.iloc[-1])
            idx_1w = min(5, len(closes) - 1)
            return_1w = (current / float(closes.iloc[-idx_1w - 1]) - 1) * 100

            if sector not in sector_data:
                sector_data[sector] = {"returns": [], "tickers": []}
            sector_data[sector]["returns"].append(return_1w)
            sector_data[sector]["tickers"].append(ticker)
        except Exception:
            continue

    result = {}
    for sector, data in sector_data.items():
        if data["returns"]:
            result[sector] = {
                "avg_return_1w": round(sum(data["returns"]) / len(data["returns"]), 2),
                "tickers": data["tickers"],
            }

    return result
