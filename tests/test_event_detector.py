"""이벤트 감지 모듈 단위 테스트"""
import sys
from pathlib import Path

# event_detector의 내부 함수들을 직접 import하기 위해 경로 추가
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts" / "core"))

from event_detector import (
    _detect_streak_events,
    _detect_rank_change_events,
    _detect_asset_milestone_events,
    _detect_close_race_events,
    _detect_first_time_events,
)


def _make_rankings(rank_order):
    """투자자 이름 리스트 → rankings 배열 생성 (1위부터)"""
    return [
        {"rank": i + 1, "investor": name, "total_return_pct": 10 - i, "total_asset": 5_500_000 - i * 50000}
        for i, name in enumerate(rank_order)
    ]


def _make_report(date, rank_order, details_override=None):
    rankings = _make_rankings(rank_order)
    investor_details = {}
    for r in rankings:
        investor_details[r["investor"]] = {
            "total_asset": r["total_asset"],
            "total_return_pct": r["total_return_pct"],
        }
    if details_override:
        for name, overrides in details_override.items():
            if name in investor_details:
                investor_details[name].update(overrides)
            else:
                investor_details[name] = overrides
    return {"date": date, "rankings": rankings, "investor_details": investor_details}


NAMES = ["강돌진", "김균형", "이든든", "장반대", "정기준", "윤순환", "문여론", "박기술", "최배당", "한따라", "로로캅"]


class TestStreakEvents:
    def test_3day_streak(self):
        reports = [
            _make_report(f"2026-03-0{i+1}", NAMES)  # 강돌진 항상 1위
            for i in range(3)
        ]
        today = reports[-1]
        events = _detect_streak_events(today, reports)
        assert any("3일 연속 1위" in e for e in events)

    def test_5day_streak(self):
        reports = [
            _make_report(f"2026-03-{i+1:02d}", NAMES)
            for i in range(5)
        ]
        today = reports[-1]
        events = _detect_streak_events(today, reports)
        assert any("5일 연속 1위" in e for e in events)

    def test_no_streak_milestone(self):
        reports = [
            _make_report(f"2026-03-0{i+1}", NAMES)
            for i in range(2)
        ]
        today = reports[-1]
        events = _detect_streak_events(today, reports)
        assert len(events) == 0

    def test_streak_broken(self):
        # 2일 강돌진 1위, 3일차 김균형 1위
        names_alt = ["김균형"] + [n for n in NAMES if n != "김균형"]
        reports = [
            _make_report("2026-03-01", NAMES),
            _make_report("2026-03-02", NAMES),
            _make_report("2026-03-03", names_alt),
        ]
        today = reports[-1]
        events = _detect_streak_events(today, reports)
        assert len(events) == 0


class TestRankChangeEvents:
    def test_large_jump_up(self):
        prev = _make_report("2026-03-01", NAMES)
        # 로로캅(11위) → 3위
        new_order = ["강돌진", "김균형", "로로캅", "이든든", "장반대", "정기준", "윤순환", "문여론", "박기술", "최배당", "한따라"]
        today = _make_report("2026-03-02", new_order)
        events = _detect_rank_change_events(today, prev)
        assert any("로로캅" in e and "급등" in e for e in events)

    def test_large_drop(self):
        prev = _make_report("2026-03-01", NAMES)
        # 김균형(2위) → 10위
        new_order = ["강돌진", "이든든", "장반대", "정기준", "윤순환", "문여론", "박기술", "최배당", "한따라", "김균형", "로로캅"]
        today = _make_report("2026-03-02", new_order)
        events = _detect_rank_change_events(today, prev)
        assert any("김균형" in e and "하락" in e for e in events)

    def test_small_change_no_event(self):
        prev = _make_report("2026-03-01", NAMES)
        # 1순위만 변동
        new_order = ["강돌진", "이든든", "김균형", "장반대", "정기준", "윤순환", "문여론", "박기술", "최배당", "한따라", "로로캅"]
        today = _make_report("2026-03-02", new_order)
        events = _detect_rank_change_events(today, prev)
        assert len(events) == 0

    def test_no_prev(self):
        today = _make_report("2026-03-01", NAMES)
        events = _detect_rank_change_events(today, None)
        assert len(events) == 0


class TestAssetMilestoneEvents:
    def test_milestone_crossing(self):
        prev = _make_report("2026-03-01", NAMES, {"강돌진": {"total_asset": 5_900_000, "total_return_pct": 5}})
        today = _make_report("2026-03-02", NAMES, {"강돌진": {"total_asset": 6_050_000, "total_return_pct": 6}})
        events = _detect_asset_milestone_events(today, prev)
        assert any("600만원 돌파" in e for e in events)

    def test_loss_transition(self):
        prev = _make_report("2026-03-01", NAMES, {"이든든": {"total_asset": 5_010_000, "total_return_pct": 0.2}})
        today = _make_report("2026-03-02", NAMES, {"이든든": {"total_asset": 4_980_000, "total_return_pct": -0.4}})
        events = _detect_asset_milestone_events(today, prev)
        assert any("손실 전환" in e and "이든든" in e for e in events)

    def test_no_milestone(self):
        prev = _make_report("2026-03-01", NAMES, {"강돌진": {"total_asset": 5_100_000, "total_return_pct": 2}})
        today = _make_report("2026-03-02", NAMES, {"강돌진": {"total_asset": 5_200_000, "total_return_pct": 4}})
        events = _detect_asset_milestone_events(today, prev)
        assert len(events) == 0


class TestCloseRaceEvents:
    def test_close_race_detected(self):
        rankings = [
            {"rank": 1, "investor": "강돌진", "total_return_pct": 5.05},
            {"rank": 2, "investor": "김균형", "total_return_pct": 5.00},
            {"rank": 3, "investor": "이든든", "total_return_pct": 3.00},
        ]
        today = {"date": "2026-03-02", "rankings": rankings, "investor_details": {}}
        events = _detect_close_race_events(today)
        assert any("초접전" in e for e in events)

    def test_no_close_race(self):
        rankings = [
            {"rank": 1, "investor": "강돌진", "total_return_pct": 5.0},
            {"rank": 2, "investor": "김균형", "total_return_pct": 3.0},
        ]
        today = {"date": "2026-03-02", "rankings": rankings, "investor_details": {}}
        events = _detect_close_race_events(today)
        assert len(events) == 0


class TestFirstTimeEvents:
    def test_first_time_rank1(self):
        history = [
            _make_report("2026-03-01", NAMES),  # 강돌진 1위
            _make_report("2026-03-02", NAMES),  # 강돌진 1위
        ]
        # 이든든이 처음으로 1위
        new_order = ["이든든"] + [n for n in NAMES if n != "이든든"]
        today = _make_report("2026-03-03", new_order)
        all_reports = history + [today]
        events = _detect_first_time_events(today, all_reports)
        assert any("이든든" in e and "처음으로 1위" in e for e in events)

    def test_not_first_time(self):
        # 이든든이 과거에도 1위였음
        order1 = ["이든든"] + [n for n in NAMES if n != "이든든"]
        history = [
            _make_report("2026-03-01", order1),
            _make_report("2026-03-02", NAMES),
        ]
        today = _make_report("2026-03-03", order1)
        all_reports = history + [today]
        events = _detect_first_time_events(today, all_reports)
        assert not any("이든든" in e and "처음으로 1위" in e for e in events)

    def test_first_time_last_place(self):
        history = [_make_report("2026-03-01", NAMES)]  # 로로캅 꼴찌
        # 강돌진이 처음으로 꼴찌
        new_order = list(reversed(NAMES))  # 로로캅 1위, 강돌진 꼴찌
        today = _make_report("2026-03-02", new_order)
        all_reports = history + [today]
        events = _detect_first_time_events(today, all_reports)
        assert any("강돌진" in e and "꼴찌" in e for e in events)
