"""숫자 파싱 테스트"""
from institutional_flow import _parse_number


class TestParseNumber:
    def test_positive_with_comma(self):
        assert _parse_number("+1,234") == 1234

    def test_negative(self):
        assert _parse_number("-567") == -567

    def test_zero(self):
        assert _parse_number("0") == 0

    def test_empty_string(self):
        assert _parse_number("") == 0

    def test_non_numeric(self):
        assert _parse_number("abc") == 0

    def test_large_number(self):
        assert _parse_number("+1,234,567") == 1234567
