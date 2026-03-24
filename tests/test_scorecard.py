"""스코어카드 엔진 단위 테스트"""
import sys
import math
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts" / "core"))


def test_weights_sum_to_one():
    from scorecard import WEIGHTS
    assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-9


def test_min_max_normalize_higher_better():
    from scorecard import _min_max_normalize
    result = _min_max_normalize([10, 20, 30], higher_better=True)
    assert result[0] == 0.0  # 최소값 → 0
    assert result[2] == 100.0  # 최대값 → 100
    assert result[1] == 50.0  # 중간값 → 50


def test_min_max_normalize_lower_better():
    from scorecard import _min_max_normalize
    result = _min_max_normalize([10, 20, 30], higher_better=False)
    assert result[0] == 100.0  # 최소값 → 100 (낮을수록 좋음)
    assert result[2] == 0.0


def test_min_max_normalize_all_same():
    from scorecard import _min_max_normalize
    result = _min_max_normalize([5, 5, 5])
    assert all(v == 50.0 for v in result)


def test_assign_ranks():
    from scorecard import _assign_ranks
    ranks = _assign_ranks([80, 60, 90, 70])
    assert ranks == [2, 4, 1, 3]


def test_compute_sortino_basic():
    from scorecard import _compute_sortino
    # 양수 수익만 → 하방 편차 없음 → cap at 3
    returns = [0.01, 0.005, 0.003, 0.008, 0.002]
    result = _compute_sortino(returns)
    assert result == 3.0


def test_compute_sortino_mixed():
    from scorecard import _compute_sortino
    returns = [0.01, -0.02, 0.005, -0.01, 0.003, -0.005, 0.008, -0.003]
    result = _compute_sortino(returns)
    assert isinstance(result, float)


def test_compute_sortino_too_few():
    from scorecard import _compute_sortino
    assert _compute_sortino([0.01, 0.02]) == 0.0


def test_max_consecutive_loss_days():
    from scorecard import _max_consecutive_loss_days
    returns = [0.01, -0.01, -0.02, -0.005, 0.01, -0.01, -0.02]
    assert _max_consecutive_loss_days(returns) == 3


def test_max_consecutive_loss_days_none():
    from scorecard import _max_consecutive_loss_days
    assert _max_consecutive_loss_days([0.01, 0.02, 0.03]) == 0


def test_monthly_return_std_dev():
    from scorecard import _monthly_return_std_dev
    # 2개월 데이터
    data = [
        ("2026-01-02", 5_000_000),
        ("2026-01-15", 5_100_000),
        ("2026-01-31", 5_200_000),
        ("2026-02-01", 5_200_000),
        ("2026-02-15", 5_050_000),
        ("2026-02-28", 5_000_000),
    ]
    result = _monthly_return_std_dev(data)
    assert result > 0  # 두 달의 수익률이 다르므로 표준편차 > 0


def test_monthly_return_std_dev_single_month():
    from scorecard import _monthly_return_std_dev
    data = [("2026-01-02", 5_000_000), ("2026-01-31", 5_100_000)]
    assert _monthly_return_std_dev(data) == 0.0


def test_compute_sharpe():
    from scorecard import _compute_sharpe
    returns = [0.005, -0.003, 0.002, 0.001, -0.001, 0.004, 0.003]
    result = _compute_sharpe(returns)
    assert isinstance(result, float)


def test_compute_mdd():
    from scorecard import _compute_mdd
    assets = [100, 110, 105, 95, 100, 90, 95]
    mdd = _compute_mdd(assets)
    # 최고점 110 → 최저점 90: (90-110)/110 = -18.18%
    assert mdd < -18
    assert mdd > -19
