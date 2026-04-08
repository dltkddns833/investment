"""안전 장치 모듈 단위 테스트"""
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts" / "core"))


def test_check_daily_loss_triggers():
    from safety import check_daily_loss
    # -3.5% → True
    assert check_daily_loss(965_000, 1_000_000) is True


def test_check_daily_loss_ok():
    from safety import check_daily_loss
    # -1% → False
    assert check_daily_loss(990_000, 1_000_000) is False


def test_check_daily_loss_zero_prev():
    from safety import check_daily_loss
    assert check_daily_loss(500_000, 0) is False


def test_check_cumulative_loss_triggers():
    from safety import check_cumulative_loss
    # -11% → True
    assert check_cumulative_loss(1_780_000, 2_000_000) is True


def test_check_cumulative_loss_ok():
    from safety import check_cumulative_loss
    # -5% → False
    assert check_cumulative_loss(1_900_000, 2_000_000) is False


def test_validate_meta_allocation_ok():
    from safety import validate_meta_allocation
    alloc = {"005930.KS": 0.25, "000660.KS": 0.20, "035420.KS": 0.15}
    adjusted, violations = validate_meta_allocation(alloc)
    assert len(violations) == 0
    assert sum(adjusted.values()) <= 1.0


def test_validate_meta_allocation_single_stock_limit():
    from safety import validate_meta_allocation
    alloc = {"005930.KS": 0.40, "000660.KS": 0.20}
    adjusted, violations = validate_meta_allocation(alloc)
    assert adjusted["005930.KS"] <= 0.30
    assert any(v["type"] == "단일종목초과" for v in violations)


def test_validate_meta_allocation_over_100():
    from safety import validate_meta_allocation
    alloc = {"005930.KS": 0.30, "000660.KS": 0.30, "035420.KS": 0.30, "051910.KS": 0.20}
    adjusted, violations = validate_meta_allocation(alloc)
    assert sum(adjusted.values()) <= 1.0


def test_validate_meta_allocation_min_cash():
    from safety import validate_meta_allocation
    alloc = {"005930.KS": 0.30, "000660.KS": 0.30, "035420.KS": 0.30}
    adjusted, violations = validate_meta_allocation(alloc)
    total = sum(adjusted.values())
    assert total <= 0.95  # 최소 5% 현금


def test_check_stop_loss_triggers():
    from safety import check_stop_loss
    holdings = [
        {"ticker": "005930.KS", "profit_pct": -9, "shares": 10},
        {"ticker": "000660.KS", "profit_pct": 5, "shares": 20},
    ]
    result = check_stop_loss(holdings, meta_config={"stop_loss_by_regime": {"neutral": -8}}, regime="neutral")
    assert len(result["stop_loss"]) == 1
    assert result["stop_loss"][0]["ticker"] == "005930.KS"
    assert "take_profit" not in result


def test_check_stop_loss_alias():
    from safety import check_stop_loss_take_profit, check_stop_loss
    assert check_stop_loss_take_profit is check_stop_loss


def test_check_trailing_protect_triggers():
    from safety import check_trailing_protect
    # avg_price=10000, hwm=13000 (+30%), current_price=10500 (고점 대비 -19.2%)
    current_holdings = [
        {"ticker": "005930.KS", "avg_price": 10000, "current_price": 10500,
         "shares": 10, "code": "005930", "name": "삼성전자", "profit_pct": 5.0},
    ]
    prev_holdings = {
        "005930.KS": {"high_water_mark": 13000, "avg_price": 10000, "acquired_date": "2026-01-01"},
    }
    result = check_trailing_protect(current_holdings, prev_holdings, meta_config={})
    assert len(result) == 1
    assert result[0]["drawdown_from_high_pct"] >= 15


def test_check_trailing_protect_no_trigger():
    from safety import check_trailing_protect
    # avg_price=10000, hwm=13000 (+30%), current_price=11500 (고점 대비 -11.5%)
    current_holdings = [
        {"ticker": "005930.KS", "avg_price": 10000, "current_price": 11500,
         "shares": 10, "code": "005930", "name": "삼성전자", "profit_pct": 15.0},
    ]
    prev_holdings = {
        "005930.KS": {"high_water_mark": 13000, "avg_price": 10000, "acquired_date": "2026-01-01"},
    }
    result = check_trailing_protect(current_holdings, prev_holdings, meta_config={})
    assert len(result) == 0


def test_check_trailing_protect_hwm_below_threshold():
    from safety import check_trailing_protect
    # avg_price=10000, hwm=11500 (+15%), current_price=9000 (고점 대비 -21.7%)
    # hwm_gain_pct = 15% < threshold 20% → 트레일링 비활성
    current_holdings = [
        {"ticker": "005930.KS", "avg_price": 10000, "current_price": 9000,
         "shares": 10, "code": "005930", "name": "삼성전자", "profit_pct": -10.0},
    ]
    prev_holdings = {
        "005930.KS": {"high_water_mark": 11500, "avg_price": 10000, "acquired_date": "2026-01-01"},
    }
    result = check_trailing_protect(current_holdings, prev_holdings, meta_config={})
    assert len(result) == 0


def test_is_trading_hours():
    from safety import is_trading_hours
    result = is_trading_hours()
    assert isinstance(result, bool)
