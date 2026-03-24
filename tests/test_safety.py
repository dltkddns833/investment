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


def test_is_trading_hours():
    from safety import is_trading_hours
    result = is_trading_hours()
    assert isinstance(result, bool)
