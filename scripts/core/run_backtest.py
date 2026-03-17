"""백테스트 CLI 진입점

Usage:
    python3 scripts/core/backtest.py --start 2025-03-01 --end 2026-03-01
    python3 scripts/core/backtest.py --start 2025-06-01 --end 2025-12-31 --investors A,B,E
    python3 scripts/core/backtest.py --start 2025-03-01 --end 2026-03-01 --cache
    python3 scripts/core/backtest.py --start 2025-03-01 --end 2026-03-01 --no-save
"""
import argparse
import sys
import os

# 경로 설정
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))

from backtest.engine import run_backtest


def main():
    parser = argparse.ArgumentParser(description="투자 전략 백테스트")
    parser.add_argument("--start", required=True, help="시작일 (YYYY-MM-DD)")
    parser.add_argument("--end", required=True, help="종료일 (YYYY-MM-DD)")
    parser.add_argument("--investors", default=None,
                        help="투자자 ID 목록 (쉼표 구분, 기본: 전체)")
    parser.add_argument("--cache", action="store_true",
                        help="캐시된 가격 데이터 사용")
    parser.add_argument("--initial-capital", type=int, default=5_000_000,
                        help="초기 자본 (기본: 5,000,000)")
    parser.add_argument("--no-save", action="store_true",
                        help="결과를 Supabase에 저장하지 않음")
    args = parser.parse_args()

    investor_ids = args.investors.split(",") if args.investors else None

    run_backtest(
        start_date=args.start,
        end_date=args.end,
        investor_ids=investor_ids,
        use_cache=args.cache,
        initial_capital=args.initial_capital,
        save_to_db=not args.no_save,
    )


if __name__ == "__main__":
    main()
