"""백테스트 엔진 단위 테스트"""
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts", "core"))

from backtest.engine import InMemoryPortfolio, get_trading_days
from backtest.metrics import compute_metrics


class TestInMemoryPortfolio:
    """InMemoryPortfolio 기본 동작 테스트"""

    def _make_portfolio(self, **kwargs):
        defaults = {
            "investor_id": "T",
            "name": "테스트",
            "strategy": "테스트 전략",
            "rebalance_frequency_days": 1,
            "initial_capital": 5_000_000,
            "trading_costs": {
                "slippage_pct": 0.0005,
                "buy_commission_pct": 0.00015,
                "sell_commission_pct": 0.00015,
                "sell_tax_pct": {"KS": 0.0018, "KQ": 0},
            },
        }
        defaults.update(kwargs)
        return InMemoryPortfolio(**defaults)

    def test_initial_state(self):
        pf = self._make_portfolio()
        assert pf.cash == 5_000_000
        assert pf.holdings == {}
        assert pf.last_rebalanced is None

    def test_calc_fees_buy(self):
        pf = self._make_portfolio()
        exec_price, fee = pf.calc_fees("005930.KS", 70000, 10, "buy")
        # 슬리피지: 70000 * 1.0005 = 70035
        assert exec_price == 70035
        # 수수료: 70035 * 10 * 0.00015 = 105.05 → 105
        assert fee == 105

    def test_calc_fees_sell_ks(self):
        pf = self._make_portfolio()
        exec_price, fee = pf.calc_fees("005930.KS", 70000, 10, "sell")
        # 슬리피지: 70000 * 0.9995 = 69965
        assert exec_price == 69965
        # 수수료: 69965 * 10 * (0.00015 + 0.0018) = 1364.3 → 1364
        assert fee == 1364

    def test_calc_fees_sell_kq(self):
        pf = self._make_portfolio()
        exec_price, fee = pf.calc_fees("000000.KQ", 10000, 10, "sell")
        # KQ는 sell_tax 0%
        # 수수료: 9995 * 10 * 0.00015 = 14.99 → 14
        assert fee == 14

    def test_rebalance_buy(self):
        pf = self._make_portfolio()
        prices = {
            "005930.KS": {"name": "삼성전자", "sector": "반도체", "price": 70000},
            "000660.KS": {"name": "SK하이닉스", "sector": "반도체", "price": 200000},
        }
        allocation = {"005930.KS": 0.5, "000660.KS": 0.5}
        trades = pf.rebalance(allocation, prices, "2026-01-02")

        assert len(trades) == 2
        assert all(t["type"] == "buy" for t in trades)
        assert pf.last_rebalanced == "2026-01-02"
        assert "005930.KS" in pf.holdings
        assert "000660.KS" in pf.holdings
        assert pf.cash < 5_000_000  # 현금 감소

    def test_rebalance_sell_then_buy(self):
        pf = self._make_portfolio()
        prices = {"005930.KS": {"name": "삼성전자", "sector": "반도체", "price": 70000}}
        # 첫 리밸런싱: 100% 삼성전자
        pf.rebalance({"005930.KS": 1.0}, prices, "2026-01-02")
        shares_before = pf.holdings["005930.KS"]["shares"]
        assert shares_before > 0

        # 두 번째: 비중 50%로 축소
        trades = pf.rebalance({"005930.KS": 0.5}, prices, "2026-01-03")
        sell_trades = [t for t in trades if t["type"] == "sell"]
        assert len(sell_trades) > 0
        assert pf.holdings["005930.KS"]["shares"] < shares_before

    def test_evaluate(self):
        pf = self._make_portfolio()
        prices = {"005930.KS": {"name": "삼성전자", "sector": "반도체", "price": 70000}}
        pf.rebalance({"005930.KS": 1.0}, prices, "2026-01-02")

        result = pf.evaluate(prices)
        assert result["total_asset"] > 0
        assert result["investor_id"] == "T"
        assert result["num_holdings"] == 1

    def test_is_rebalance_due_first_time(self):
        pf = self._make_portfolio()
        assert pf.is_rebalance_due("2026-01-02") is True

    def test_is_rebalance_due_frequency(self):
        pf = self._make_portfolio(rebalance_frequency_days=7)
        pf.last_rebalanced = "2026-01-02"
        # 3 영업일 후 → 아직 아님
        assert pf.is_rebalance_due("2026-01-07") is False
        # 7 영업일 후 → due
        assert pf.is_rebalance_due("2026-01-13") is True

    def test_check_target_prices_stop_loss(self):
        pf = self._make_portfolio()
        pf.holdings["TEST.KQ"] = {
            "name": "테스트주", "shares": 100, "avg_price": 10000,
        }
        pf.cash = 0

        # 가격이 -10% 하락 → 손절
        prices = {"TEST.KQ": {"name": "테스트주", "sector": "", "price": 8900}}
        trades = pf.check_target_prices(prices, "2026-01-02")

        assert len(trades) == 1
        assert trades[0]["reason"].startswith("손절")
        assert "TEST.KQ" not in pf.holdings
        assert pf.cash > 0

    def test_check_target_prices_partial_sell(self):
        pf = self._make_portfolio()
        pf.holdings["TEST.KQ"] = {
            "name": "테스트주", "shares": 99, "avg_price": 10000,
        }
        pf.cash = 0

        # +15% → 1/3 매도
        prices = {"TEST.KQ": {"name": "테스트주", "sector": "", "price": 11600}}
        trades = pf.check_target_prices(prices, "2026-01-02")

        assert len(trades) == 1
        assert "+15%" in trades[0]["reason"]
        assert pf.holdings["TEST.KQ"]["shares"] < 99

    def test_snapshot(self):
        pf = self._make_portfolio()
        prices = {"005930.KS": {"name": "삼성전자", "sector": "반도체", "price": 70000}}
        pf.snapshot("2026-01-02", prices)
        assert len(pf.daily_snapshots) == 1
        assert pf.daily_snapshots[0][0] == "2026-01-02"
        assert pf.daily_snapshots[0][1] == 5_000_000  # 매수 안 했으므로 초기 자본


class TestMetrics:
    """성과 지표 계산 테스트"""

    def test_basic_metrics(self):
        # 5일간 +10% 수익
        daily_assets = [
            ("2026-01-02", 1000000),
            ("2026-01-03", 1020000),
            ("2026-01-04", 1040000),
            ("2026-01-05", 1060000),
            ("2026-01-06", 1100000),
        ]
        m = compute_metrics(daily_assets, 1000000)
        assert m["cumulative_return_pct"] == 10.0
        assert m["trading_days"] == 5
        assert m["mdd_pct"] == 0  # 계속 상승했으므로 MDD 없음

    def test_mdd(self):
        daily_assets = [
            ("d1", 1000000),
            ("d2", 1100000),  # peak
            ("d3", 900000),   # -18.18% drawdown
            ("d4", 950000),
        ]
        m = compute_metrics(daily_assets, 1000000)
        assert m["mdd_pct"] < -15  # 최소 -15% 이하

    def test_win_rate(self):
        txns = [
            {"type": "sell", "profit": 100},
            {"type": "sell", "profit": -50},
            {"type": "sell", "profit": 200},
            {"type": "buy"},  # 매수는 무시
        ]
        daily_assets = [("d1", 1000000), ("d2", 1010000)]
        m = compute_metrics(daily_assets, 1000000, transactions=txns)
        assert m["win_rate_pct"] == pytest.approx(66.7, abs=0.1)

    def test_empty_data(self):
        m = compute_metrics([], 1000000)
        assert m["cumulative_return_pct"] == 0
        assert m["sharpe_ratio"] == 0


class TestTradingDays:
    """영업일 계산 테스트"""

    def test_excludes_weekends(self):
        # 2026-01-05 (월) ~ 2026-01-09 (금) = 5영업일
        days = get_trading_days("2026-01-05", "2026-01-11")
        assert len(days) == 5  # 토일 제외

    def test_excludes_holidays(self):
        # 2026-01-01 = 신정, 공휴일
        days = get_trading_days("2025-12-29", "2026-01-02")
        # 12/29(월), 12/30(화), 12/31(수), 1/1(목-공휴일), 1/2(금)
        assert all(d.weekday() < 5 for d in days)
