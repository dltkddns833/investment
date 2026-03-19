"""리스크 관리 모듈 단위 테스트"""
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts" / "core"))


# validate_allocation은 Supabase를 호출하므로 mock 필요
def _mock_risk_limits():
    return {
        "daily_loss_pct": -3.0,
        "cumulative_loss_pct": -10.0,
        "max_single_stock_pct": 30.0,
        "max_single_sector_pct": 50.0,
        "min_cash_pct": 5.0,
        "stock_alert_change_pct": 10.0,
        "consecutive_loss_alert_days": 5,
        "mdd_alert_pct": -8.0,
        "exceptions": {
            "N": {"max_single_stock_pct": 100.0, "max_single_sector_pct": 100.0, "min_cash_pct": 0.0},
            "M": {"min_cash_pct": 0.0},
            "K": {"max_single_sector_pct": 100.0},
        },
    }


def _mock_sector_map():
    return {
        "005930.KS": "반도체",
        "000660.KS": "반도체",
        "035420.KS": "IT",
        "051910.KS": "화학",
        "006400.KS": "자동차",
        "035720.KS": "게임",
        "003670.KS": "화학",
    }


@patch("risk_manager._build_sector_map", return_value=_mock_sector_map())
@patch("risk_manager.load_risk_limits", return_value=_mock_risk_limits())
class TestValidateAllocation:
    def test_single_stock_exceeded(self, mock_limits, mock_sector):
        """단일 종목 30% 초과 → 30%로 잘림"""
        from risk_manager import validate_allocation

        allocation = {"005930.KS": 0.40, "035420.KS": 0.30, "051910.KS": 0.25}
        adjusted, violations = validate_allocation("A", allocation)

        assert adjusted["005930.KS"] == 0.30
        assert any(v["type"] == "단일종목초과" for v in violations)

    def test_n_investor_no_stock_limit(self, mock_limits, mock_sector):
        """N 전몰빵은 단일종목 100%까지 허용"""
        from risk_manager import validate_allocation

        allocation = {"005930.KS": 0.55, "000660.KS": 0.40}
        adjusted, violations = validate_allocation("N", allocation)

        # 단일종목 초과 violation이 없어야 함
        assert not any(v["type"] == "단일종목초과" for v in violations)
        assert adjusted["005930.KS"] == 0.55

    def test_sector_exceeded(self, mock_limits, mock_sector):
        """섹터 50% 초과 → 비례 축소"""
        from risk_manager import validate_allocation

        # 반도체 60%
        allocation = {"005930.KS": 0.35, "000660.KS": 0.25, "035420.KS": 0.20, "051910.KS": 0.15}
        adjusted, violations = validate_allocation("A", allocation)

        # 단일종목도 걸리므로 먼저 30%로 잘리고, 그 다음 섹터 체크
        semi_total = adjusted["005930.KS"] + adjusted["000660.KS"]
        assert semi_total <= 0.5001  # 50% 이하
        assert any(v["type"] == "섹터초과" for v in violations)

    def test_k_investor_no_sector_limit(self, mock_limits, mock_sector):
        """K 로로캅은 섹터 100%까지 허용"""
        from risk_manager import validate_allocation

        allocation = {"005930.KS": 0.30, "000660.KS": 0.30, "035420.KS": 0.30}
        adjusted, violations = validate_allocation("K", allocation)

        # 섹터 초과 violation이 없어야 함 (반도체 60%지만 K는 예외)
        assert not any(v["type"] == "섹터초과" for v in violations)

    def test_min_cash_enforcement(self, mock_limits, mock_sector):
        """현금 5% 미만 → 전체 비례 축소"""
        from risk_manager import validate_allocation

        # 합계 0.98 (현금 2%)
        allocation = {"005930.KS": 0.30, "035420.KS": 0.28, "051910.KS": 0.20, "006400.KS": 0.20}
        adjusted, violations = validate_allocation("A", allocation)

        alloc_sum = sum(adjusted.values())
        assert alloc_sum <= 0.9501  # 95% 이하 (현금 5%+)
        assert any(v["type"] == "현금부족" for v in violations)

    def test_m_investor_no_cash_limit(self, mock_limits, mock_sector):
        """M 오판단은 현금 0%까지 허용"""
        from risk_manager import validate_allocation

        allocation = {"005930.KS": 0.30, "035420.KS": 0.30, "051910.KS": 0.30}
        adjusted, violations = validate_allocation("M", allocation)

        # 현금부족 violation이 없어야 함
        assert not any(v["type"] == "현금부족" for v in violations)

    def test_valid_allocation_no_violations(self, mock_limits, mock_sector):
        """유효한 배분 → violation 없음"""
        from risk_manager import validate_allocation

        allocation = {
            "005930.KS": 0.20,
            "035420.KS": 0.20,
            "051910.KS": 0.15,
            "006400.KS": 0.15,
            "035720.KS": 0.15,
        }
        adjusted, violations = validate_allocation("B", allocation)

        assert len(violations) == 0
        assert adjusted == allocation


class TestCheckDailyLoss:
    @patch("risk_manager.supabase")
    @patch("risk_manager.load_risk_limits", return_value=_mock_risk_limits())
    def test_daily_loss_detected(self, mock_limits, mock_sb):
        from risk_manager import _check_daily_loss

        mock_sb.table.return_value.select.return_value.execute.return_value.data = [
            {"id": "A", "name": "강돌진"},
        ]

        today = {
            "investor_details": {
                "강돌진": {"total_asset": 4_800_000},
            }
        }
        prev = {
            "investor_details": {
                "강돌진": {"total_asset": 5_000_000},
            }
        }
        events = _check_daily_loss("2026-03-19", today, prev)
        assert len(events) == 1
        assert events[0]["event_type"] == "daily_loss"
        assert events[0]["details"]["change_pct"] == -4.0

    @patch("risk_manager.supabase")
    @patch("risk_manager.load_risk_limits", return_value=_mock_risk_limits())
    def test_no_daily_loss(self, mock_limits, mock_sb):
        from risk_manager import _check_daily_loss

        mock_sb.table.return_value.select.return_value.execute.return_value.data = [
            {"id": "A", "name": "강돌진"},
        ]

        today = {"investor_details": {"강돌진": {"total_asset": 5_050_000}}}
        prev = {"investor_details": {"강돌진": {"total_asset": 5_000_000}}}
        events = _check_daily_loss("2026-03-19", today, prev)
        assert len(events) == 0


class TestCheckCumulativeLoss:
    @patch("risk_manager.supabase")
    @patch("risk_manager.load_risk_limits", return_value=_mock_risk_limits())
    def test_cumulative_loss_detected(self, mock_limits, mock_sb):
        from risk_manager import _check_cumulative_loss

        mock_sb.table.return_value.select.return_value.execute.return_value.data = [
            {"id": "N", "name": "전몰빵"},
        ]

        today = {"investor_details": {"전몰빵": {"total_asset": 4_400_000}}}
        events = _check_cumulative_loss("2026-03-19", today)
        assert len(events) == 1
        assert events[0]["details"]["cumulative_pct"] == -12.0

    @patch("risk_manager.supabase")
    @patch("risk_manager.load_risk_limits", return_value=_mock_risk_limits())
    def test_no_cumulative_loss(self, mock_limits, mock_sb):
        from risk_manager import _check_cumulative_loss

        mock_sb.table.return_value.select.return_value.execute.return_value.data = [
            {"id": "A", "name": "강돌진"},
        ]

        today = {"investor_details": {"강돌진": {"total_asset": 4_800_000}}}
        events = _check_cumulative_loss("2026-03-19", today)
        assert len(events) == 0
