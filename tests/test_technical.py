"""기술적 지표 순수 함수 테스트 (RSI, MACD, 볼린저밴드)"""
import pandas as pd
from technical_indicators import calculate_rsi, calculate_macd, calculate_bollinger_bands


class TestRSI:
    def test_mostly_gains(self):
        # 대부분 상승 + 소폭 하락 → RSI 높음
        data = [100]
        for i in range(39):
            data.append(data[-1] + 1 if i % 10 != 5 else data[-1] - 0.5)
        closes = pd.Series(data)
        rsi = calculate_rsi(closes, period=14)
        assert rsi.iloc[-1] > 80

    def test_all_losses(self):
        closes = pd.Series(range(140, 100, -1))
        rsi = calculate_rsi(closes, period=14)
        assert rsi.iloc[-1] < 10

    def test_mixed_range(self):
        closes = pd.Series([100, 102, 99, 103, 98, 104, 97, 105, 96, 106,
                            95, 107, 94, 108, 93, 109, 92, 110, 91, 111])
        rsi = calculate_rsi(closes, period=14)
        val = rsi.iloc[-1]
        assert 30 <= val <= 70


class TestMACD:
    def test_returns_three_series(self):
        closes = pd.Series(range(1000, 1050))
        macd_line, signal_line, histogram = calculate_macd(closes)
        assert len(macd_line) == len(closes)
        assert len(signal_line) == len(closes)
        assert len(histogram) == len(closes)

    def test_constant_price_histogram_near_zero(self):
        closes = pd.Series([10000] * 50)
        _, _, histogram = calculate_macd(closes)
        assert abs(histogram.iloc[-1]) < 0.01


class TestBollingerBands:
    def test_upper_gt_middle_gt_lower(self):
        closes = pd.Series(range(100, 130))
        upper, middle, lower = calculate_bollinger_bands(closes, period=20)
        idx = -1
        assert upper.iloc[idx] > middle.iloc[idx] > lower.iloc[idx]

    def test_low_volatility_narrow_band(self):
        closes = pd.Series([10000] * 25)
        upper, middle, lower = calculate_bollinger_bands(closes, period=20)
        band_width = upper.iloc[-1] - lower.iloc[-1]
        assert band_width < 1
