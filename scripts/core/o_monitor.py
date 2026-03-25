"""O 정익절 장중 실시간 모니터링

장중(09:10~15:20) 10분 간격으로 보유종목 현재가를 체크하여
+5% 익절 / -3% 손절을 자동 실행한다.

Usage:
    python3 scripts/core/o_monitor.py              # 실행
    python3 scripts/core/o_monitor.py --dry-run     # 매도 없이 로그만
"""
import sys
import time
import argparse
from datetime import datetime, date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "notifications"))

from supabase_client import supabase
from market import get_stock_prices
from portfolio import check_target_prices, load_portfolio, evaluate
from safety import check_kill_switch
from daily_pipeline import notify
from logger import get_logger

logger = get_logger("o_monitor")

INVESTOR_ID = "O"
SELL_TRANCHES = [{"threshold": 0.05, "sell_ratio": 1.0}]  # +5% 전량 매도
STOP_LOSS = -0.03  # -3% 전량 손절
CHECK_INTERVAL = 600  # 10분 (초)
MARKET_OPEN_HOUR, MARKET_OPEN_MIN = 9, 10
MARKET_CLOSE_HOUR, MARKET_CLOSE_MIN = 15, 20


def is_market_hours():
    """장 운영시간 체크 (09:10~15:20, 평일)"""
    now = datetime.now()
    if now.weekday() >= 5:
        return False
    market_open = now.replace(hour=MARKET_OPEN_HOUR, minute=MARKET_OPEN_MIN, second=0)
    market_close = now.replace(hour=MARKET_CLOSE_HOUR, minute=MARKET_CLOSE_MIN, second=0)
    return market_open <= now <= market_close


def get_holding_tickers():
    """O의 현재 보유종목 티커 목록"""
    portfolio = load_portfolio(INVESTOR_ID)
    return list(portfolio.get("holdings", {}).keys())


def format_trade_message(trades):
    """매매 결과를 텔레그램 메시지로 포맷"""
    lines = [f"🎯 *정익절 장중 체결* ({datetime.now().strftime('%H:%M')})"]
    for t in trades:
        emoji = "💰" if "익절" in t.get("reason", "") else "🛑"
        lines.append(
            f"{emoji} {t['ticker']} {t['shares']}주 @ {t['price']:,}원 ({t['reason']})"
        )
    return "\n".join(lines)


def run_monitor(dry_run=False):
    """메인 모니터링 루프"""
    today_str = date.today().isoformat()
    logger.info(f"O 정익절 모니터링 시작 ({today_str}, dry_run={dry_run})")
    notify(f"👁️ *정익절 모니터링 시작* ({today_str})")

    check_count = 0
    total_trades = []

    while is_market_hours():
        check_count += 1

        # 킬스위치 체크
        if check_kill_switch():
            logger.warning("킬스위치 활성화 — 모니터링 중단")
            notify("🛑 정익절: 킬스위치 활성화로 모니터링 중단")
            break

        # 보유종목 확인
        tickers = get_holding_tickers()
        if not tickers:
            logger.info(f"[#{check_count}] 보유종목 없음 — 대기")
            time.sleep(CHECK_INTERVAL)
            continue

        # 현재가 조회
        try:
            prices = get_stock_prices(tickers=tickers)
        except Exception as e:
            logger.error(f"[#{check_count}] 가격 조회 실패: {e}")
            time.sleep(CHECK_INTERVAL)
            continue

        # 수익률 로그
        portfolio = load_portfolio(INVESTOR_ID)
        for ticker in tickers:
            if ticker in prices and ticker in portfolio.get("holdings", {}):
                h = portfolio["holdings"][ticker]
                pct = (prices[ticker]["price"] / h["avg_price"] - 1) * 100
                logger.info(
                    f"[#{check_count}] {h['name']} "
                    f"{prices[ticker]['price']:,}원 "
                    f"({'+'if pct>=0 else ''}{pct:.2f}%)"
                )

        if dry_run:
            logger.info(f"[#{check_count}] dry-run — 매도 스킵")
            time.sleep(CHECK_INTERVAL)
            continue

        # 익절/손절 체크 + 실행
        trades = check_target_prices(
            INVESTOR_ID, prices, today_str,
            sell_tranches=SELL_TRANCHES,
            stop_loss=STOP_LOSS,
        )

        if trades:
            total_trades.extend(trades)
            for t in trades:
                logger.info(
                    f"  ✅ 체결: {t['type'].upper()} {t['ticker']} "
                    f"{t['shares']}주 @ {t['price']:,}원 ({t.get('reason', '')})"
                )
            notify(format_trade_message(trades))

        time.sleep(CHECK_INTERVAL)

    # 종료 요약
    summary = (
        f"👁️ *정익절 모니터링 종료* ({today_str})\n"
        f"체크 {check_count}회, 체결 {len(total_trades)}건"
    )
    if total_trades:
        for t in total_trades:
            summary += f"\n• {t['ticker']} {t['shares']}주 ({t.get('reason', '')})"
    logger.info(summary)
    notify(summary)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="O 정익절 장중 모니터링")
    parser.add_argument("--dry-run", action="store_true", help="매도 없이 로그만")
    args = parser.parse_args()

    if not is_market_hours():
        logger.info("장 운영시간이 아닙니다 (09:10~15:20 평일)")
        print("장 운영시간이 아닙니다 (09:10~15:20 평일)")
        sys.exit(0)

    run_monitor(dry_run=args.dry_run)
