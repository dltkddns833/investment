"""O 정익절 장중 실시간 모니터링

장중(09:10~15:20) 10분 간격으로 포트폴리오 총자산을 체크하여
전일 대비 +5% 달성 시 전 종목 익절, -3% 이하 시 전 종목 손절.

Usage:
    python3 scripts/core/o_monitor.py              # 실행
    python3 scripts/core/o_monitor.py --dry-run     # 매도 없이 로그만
"""
import sys
import time
import argparse
from datetime import datetime, date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "notifications"))

from supabase_client import supabase
from market import get_stock_prices
from portfolio import load_portfolio, save_portfolio, evaluate, calc_fees
from safety import check_kill_switch
from daily_pipeline import notify
from logger import get_logger

logger = get_logger("o_monitor")

INVESTOR_ID = "O"
TAKE_PROFIT = 0.05   # 총자산 전일 대비 +5% → 전 종목 매도
STOP_LOSS = -0.03     # 개별 종목 매수가 대비 -3% → 해당 종목만 매도
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


def get_prev_total_asset():
    """전일 O의 총자산 (portfolio_snapshots에서 조회)"""
    today_str = date.today().isoformat()
    rows = (
        supabase.table("portfolio_snapshots")
        .select("date, total_asset")
        .eq("investor_id", INVESTOR_ID)
        .lt("date", today_str)
        .order("date", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if rows:
        return rows[0]["total_asset"]
    # 스냅샷 없으면 초기 자본
    return 5_000_000


def sell_all_holdings(portfolio, current_prices, date_str, reason):
    """전 종목 매도 실행 (익절용)"""
    trades = []
    pending_transactions = []

    for ticker in list(portfolio["holdings"].keys()):
        if ticker not in current_prices:
            continue

        h = portfolio["holdings"][ticker]
        price = current_prices[ticker]["price"]
        sell_shares = h["shares"]
        exec_price, fee = calc_fees(ticker, price, sell_shares, "sell")
        revenue = sell_shares * exec_price
        profit = (exec_price - h["avg_price"]) * sell_shares
        name = h["name"]

        portfolio["cash"] += revenue - fee
        del portfolio["holdings"][ticker]

        trades.append({
            "type": "sell", "ticker": ticker, "shares": sell_shares,
            "price": exec_price, "reason": reason,
        })
        pending_transactions.append({
            "investor_id": INVESTOR_ID, "date": date_str, "type": "sell",
            "ticker": ticker, "name": name, "shares": sell_shares,
            "price": exec_price, "amount": revenue, "fee": fee, "profit": profit,
        })

    if pending_transactions:
        supabase.table("transactions").insert(pending_transactions).execute()

    save_portfolio(INVESTOR_ID, portfolio)
    return trades


def check_stop_loss(portfolio, current_prices, date_str):
    """개별 종목 매수가 대비 -3% 손절"""
    trades = []
    pending_transactions = []

    for ticker in list(portfolio["holdings"].keys()):
        if ticker not in current_prices:
            continue

        h = portfolio["holdings"][ticker]
        price = current_prices[ticker]["price"]
        profit_pct = price / h["avg_price"] - 1

        if profit_pct <= STOP_LOSS:
            sell_shares = h["shares"]
            exec_price, fee = calc_fees(ticker, price, sell_shares, "sell")
            revenue = sell_shares * exec_price
            profit = (exec_price - h["avg_price"]) * sell_shares
            name = h["name"]

            portfolio["cash"] += revenue - fee
            del portfolio["holdings"][ticker]

            reason = f"손절 ({profit_pct*100:+.1f}%)"
            trades.append({
                "type": "sell", "ticker": ticker, "shares": sell_shares,
                "price": exec_price, "reason": reason,
            })
            pending_transactions.append({
                "investor_id": INVESTOR_ID, "date": date_str, "type": "sell",
                "ticker": ticker, "name": name, "shares": sell_shares,
                "price": exec_price, "amount": revenue, "fee": fee, "profit": profit,
            })

    if pending_transactions:
        supabase.table("transactions").insert(pending_transactions).execute()

    if trades:
        save_portfolio(INVESTOR_ID, portfolio)
    return trades


def run_monitor(dry_run=False):
    """메인 모니터링 루프"""
    today_str = date.today().isoformat()
    prev_total_asset = get_prev_total_asset()
    logger.info(f"O 정익절 모니터링 시작 ({today_str}, 전일 자산: {prev_total_asset:,}원, dry_run={dry_run})")
    notify(f"👁️ *정익절 모니터링 시작* ({today_str})\n전일 자산: {prev_total_asset:,}원 | 익절 +5% = {int(prev_total_asset * 1.05):,}원 | 종목별 손절 -3%")

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
        portfolio = load_portfolio(INVESTOR_ID)
        holdings = portfolio.get("holdings", {})
        if not holdings:
            logger.info(f"[#{check_count}] 보유종목 없음 — 대기")
            time.sleep(CHECK_INTERVAL)
            continue

        # 현재가 조회
        tickers = list(holdings.keys())
        try:
            prices = get_stock_prices(tickers=tickers)
        except Exception as e:
            logger.error(f"[#{check_count}] 가격 조회 실패: {e}")
            time.sleep(CHECK_INTERVAL)
            continue

        # 총자산 계산
        eval_amount = sum(
            holdings[t]["shares"] * prices[t]["price"]
            for t in tickers if t in prices
        )
        total_asset = portfolio["cash"] + eval_amount
        daily_return_pct = (total_asset / prev_total_asset - 1) * 100 if prev_total_asset > 0 else 0

        logger.info(
            f"[#{check_count}] 총자산: {total_asset:,.0f}원 "
            f"(전일 대비 {daily_return_pct:+.2f}%) "
            f"현금: {portfolio['cash']:,.0f}원 | 종목수: {len(tickers)}"
        )

        # 1) 종목별 손절 체크 (매수가 대비 -3%)
        if not dry_run:
            stop_trades = check_stop_loss(portfolio, prices, today_str)
            if stop_trades:
                total_trades.extend(stop_trades)
                for t in stop_trades:
                    logger.info(f"  🛑 {t['ticker']} {t['shares']}주 ({t['reason']})")
                msg = f"🛑 *정익절 손절* ({datetime.now().strftime('%H:%M')})\n" + \
                    "\n".join(f"• {t['ticker']} {t['shares']}주 ({t['reason']})" for t in stop_trades)
                notify(msg)
                # 손절 후 포트폴리오 재로드
                portfolio = load_portfolio(INVESTOR_ID)
                holdings = portfolio.get("holdings", {})
        else:
            for ticker in tickers:
                if ticker in prices and ticker in holdings:
                    h = holdings[ticker]
                    pct = (prices[ticker]["price"] / h["avg_price"] - 1) * 100
                    if pct <= STOP_LOSS * 100:
                        logger.info(f"  [dry-run] 손절 대상: {h['name']} ({pct:+.2f}%)")

        # 2) 총자산 익절 체크 (전일 대비 +5%)
        if daily_return_pct >= TAKE_PROFIT * 100:
            reason = f"익절 (총자산 {daily_return_pct:+.2f}%)"
            logger.info(f"  🎯 익절 트리거! {reason}")

            if not dry_run:
                trades = sell_all_holdings(portfolio, prices, today_str, reason)
                if trades:
                    total_trades.extend(trades)
                    msg = f"💰 *정익절 익절 달성!* ({datetime.now().strftime('%H:%M')})\n총자산 {total_asset:,.0f}원 ({daily_return_pct:+.2f}%)\n전 종목 {len(trades)}건 매도 완료"
                    notify(msg)
            else:
                logger.info(f"  [dry-run] 전 종목 매도 스킵")

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
