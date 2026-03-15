"""영업일 판단 로직 테스트"""
from datetime import date
from weekly_report import is_business_day, is_first_business_day_of_week, get_last_week_range


class TestIsBusinessDay:
    def test_weekday(self):
        assert is_business_day(date(2026, 3, 16)) is True  # 월요일

    def test_saturday(self):
        assert is_business_day(date(2026, 3, 14)) is False

    def test_sunday(self):
        assert is_business_day(date(2026, 3, 15)) is False

    def test_new_year(self):
        assert is_business_day(date(2026, 1, 1)) is False


class TestIsFirstBusinessDayOfWeek:
    def test_monday_normal(self):
        assert is_first_business_day_of_week(date(2026, 3, 16)) is True

    def test_tuesday_after_normal_monday(self):
        assert is_first_business_day_of_week(date(2026, 3, 17)) is False


class TestGetLastWeekRange:
    def test_returns_monday_to_friday(self):
        today = date(2026, 3, 16)  # 월요일
        mon, fri = get_last_week_range(today)
        assert mon == date(2026, 3, 9)
        assert fri == date(2026, 3, 13)
        assert mon.weekday() == 0  # 월요일
        assert fri.weekday() == 4  # 금요일
