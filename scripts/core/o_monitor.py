"""O 정익절 장중 실시간 모니터링 + 능동적 트레이딩

장중(09:10~15:20) 10분 간격으로 포트폴리오 총자산을 체크하여
전일 대비 +5% 달성 시 전 종목 익절, -3% 이하 시 개별 종목 손절.

30분 간격(09:40~14:50)으로 능동 트레이딩:
- 모멘텀 이탈 종목 매도 → 급등 종목으로 교체 (일일 최대 3회)

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
from market import get_stock_prices, get_stock_prices_parallel
from portfolio import load_portfolio, load_profile, save_portfolio, evaluate, calc_fees
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

# 능동 트레이딩 설정
ACTIVE_TRADE_START = (9, 40)    # 시가 변동성 안정 후
ACTIVE_TRADE_END = (14, 50)     # 장마감 동시호가 전
MAX_DAILY_SWAPS = 3             # 일일 최대 교체 횟수
ACTIVE_CHECK_INTERVAL = 3       # 30분마다 (10분 × 3 사이클)
MIN_HOLD_CHECKS = 3             # 매수 후 최소 30분(3사이클) 보유
MOMENTUM_DROP_THRESHOLD = -0.02  # 당일 -2% 이하
VOLUME_DROP_RATIO = 0.5          # 거래량 전일 50% 미만
SURGE_PRICE_THRESHOLD = 0.03     # 당일 +3% 이상
SURGE_VOLUME_RATIO = 1.5         # 거래량 전일 1.5배 이상
MIN_LIQUIDITY_RATIO = 0.3        # 교체 시 최소 유동성 (전일 거래량의 30%)


def refresh_daily_report(current_prices, date_str):
    """O의 매매 후 daily_reports & portfolio_snapshots를 즉시 갱신"""
    try:
        result = evaluate(INVESTOR_ID, current_prices)
        profile = load_profile(INVESTOR_ID)

        existing = supabase.table("daily_reports").select("*").eq("date", date_str).execute().data
        if not existing:
            return

        report = existing[0]
        investor_name = result["investor"]

        # 기존 매매 정보 유지 + 새 trades_today 추가
        prev_detail = report["investor_details"].get(investor_name, {})
        result["rebalance_frequency_days"] = profile["rebalance_frequency_days"]
        result["rebalanced_today"] = prev_detail.get("rebalanced_today", False)
        result["total_rebalances"] = prev_detail.get("total_rebalances", 0)

        # trades_today: 기존 + 새 거래 (transactions 테이블에서 전체 조회)
        txns = supabase.table("transactions").select("type,ticker,shares,price").eq(
            "investor_id", INVESTOR_ID).eq("date", date_str).execute().data or []
        result["trades_today"] = txns

        # investor_details 업데이트
        report["investor_details"][investor_name] = result

        # rankings 재계산
        details = list(report["investor_details"].values())
        details.sort(key=lambda x: x.get("total_return_pct", 0), reverse=True)
        rankings = []
        for i, d in enumerate(details):
            rankings.append({
                "rank": i + 1,
                "investor": d["investor"],
                "strategy": d["strategy"],
                "total_asset": d["total_asset"],
                "total_return": d["total_return"],
                "total_return_pct": d["total_return_pct"],
                "num_holdings": d["num_holdings"],
                "cash_ratio": d["cash_ratio"],
                "rebalance_frequency_days": d.get("rebalance_frequency_days", 1),
                "rebalanced_today": d.get("rebalanced_today", False),
                "total_rebalances": d.get("total_rebalances", 0),
            })

        supabase.table("daily_reports").upsert({
            "date": date_str,
            "generated_at": report["generated_at"],
            "market_prices": report["market_prices"],
            "rankings": rankings,
            "investor_details": report["investor_details"],
        }).execute()

        # portfolio_snapshots 갱신
        portfolio = load_portfolio(INVESTOR_ID)
        supabase.table("portfolio_snapshots").upsert({
            "investor_id": INVESTOR_ID,
            "date": date_str,
            "holdings": result["holdings"],
            "cash": portfolio["cash"],
            "total_asset": result["total_asset"],
            "snapshot_at": datetime.now().isoformat(),
        }).execute()

        logger.info(f"  📊 daily_reports 갱신 완료 (종목 {result['num_holdings']}개, 자산 {result['total_asset']:,}원)")
    except Exception as e:
        logger.error(f"  daily_reports 갱신 실패: {e}")


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


def is_active_trading_hours():
    """능동 트레이딩 가능 시간 (09:40~14:50)"""
    now = datetime.now()
    start = now.replace(hour=ACTIVE_TRADE_START[0], minute=ACTIVE_TRADE_START[1], second=0)
    end = now.replace(hour=ACTIVE_TRADE_END[0], minute=ACTIVE_TRADE_END[1], second=0)
    return start <= now <= end


def check_momentum_exit(holdings, all_prices, buy_check_map, check_count):
    """모멘텀 이탈 종목 판별 — 3개 조건 중 2개 충족 시 매도 대상

    Returns:
        매도 대상 ticker (1개) 또는 None
    """
    worst_ticker = None
    worst_score = 0  # 충족 조건 수

    for ticker in list(holdings.keys()):
        if ticker not in all_prices:
            continue

        # 최소 보유 시간 체크
        bought_at = buy_check_map.get(ticker, 0)
        if check_count - bought_at < MIN_HOLD_CHECKS:
            continue

        # 수익률 +3% 이상이면 스킵 (기존 익절 로직에 맡김)
        h = holdings[ticker]
        price = all_prices[ticker]["price"]
        profit_pct = price / h["avg_price"] - 1
        if profit_pct >= 0.03:
            continue

        p = all_prices[ticker]
        signals = 0

        # 조건 1: 당일 하락률 -2% 이하
        if p["change_pct"] <= MOMENTUM_DROP_THRESHOLD * 100:
            signals += 1

        # 조건 2: 거래량 급감 (전일의 50% 미만)
        # prev_volume 없으면 스킵 — 나머지 2개 조건(하락률+5일선)으로 판별
        prev_vol = p.get("prev_volume", 0)
        if prev_vol > 0:
            if p["volume"] < prev_vol * VOLUME_DROP_RATIO:
                signals += 1
        else:
            logger.warning(f"  ⚠️ {h['name']}({ticker}) prev_volume 데이터 없음 — 거래량 조건 스킵")

        # 조건 3: 5일선 이탈 (현재가 < 5일선 & 전일종가 > 5일선)
        sma_5 = p.get("sma_5", 0)
        if sma_5 > 0 and price < sma_5 and p["prev_close"] > sma_5:
            signals += 1

        if signals >= 2 and signals > worst_score:
            worst_score = signals
            worst_ticker = ticker

    return worst_ticker


def find_surge_candidate(all_prices, holdings):
    """급등 종목 스캔 — 매수 후보 1개 반환

    조건: 당일 +3% 이상, 거래량 1.5배 이상, 5일 최고가 미돌파, ETF 제외
    """
    candidates = []
    held_tickers = set(holdings.keys())

    for ticker, p in all_prices.items():
        if ticker in held_tickers:
            continue

        # ETF 제외 (sector가 'ETF'인 종목)
        if p.get("sector", "") == "ETF":
            continue

        # 조건 1: 당일 +3% 이상
        if p["change_pct"] < SURGE_PRICE_THRESHOLD * 100:
            continue

        # 조건 2: 거래량 전일 1.5배 이상
        prev_vol = p.get("prev_volume", 0)
        if prev_vol <= 0 or p["volume"] < prev_vol * SURGE_VOLUME_RATIO:
            continue

        # 조건 3: 5일 최고가 5% 초과 시 제외 (꼭대기 추격 방지)
        # 돌파 초기(0~5%)는 강한 모멘텀으로 허용
        high_5d = p.get("high_5d", 0)
        if high_5d > 0 and p["price"] > high_5d * 1.05:
            continue

        # 모멘텀 스코어 = 상승률 × 거래량비
        vol_ratio = p["volume"] / prev_vol if prev_vol > 0 else 1
        score = p["change_pct"] * vol_ratio
        candidates.append((ticker, score, vol_ratio))

    if not candidates:
        return None

    # 스코어 내림차순, 상위 1종목
    candidates.sort(key=lambda x: x[1], reverse=True)
    return candidates[0][0]


def execute_swap(portfolio, sell_ticker, buy_ticker, all_prices, date_str):
    """종목 교체 실행 (매도 → 매수)

    Returns:
        (sell_trade, buy_trade) 또는 None
    """
    holdings = portfolio["holdings"]
    sell_info = holdings.get(sell_ticker)
    if not sell_info or sell_ticker not in all_prices or buy_ticker not in all_prices:
        return None

    # 매도
    sell_price = all_prices[sell_ticker]["price"]
    sell_shares = sell_info["shares"]
    sell_exec_price, sell_fee = calc_fees(sell_ticker, sell_price, sell_shares, "sell")
    sell_revenue = sell_shares * sell_exec_price
    sell_profit = (sell_exec_price - sell_info["avg_price"]) * sell_shares
    sell_name = sell_info["name"]

    portfolio["cash"] += sell_revenue - sell_fee
    del portfolio["holdings"][sell_ticker]

    # 매수 — 매도 대금의 80% 투입
    buy_budget = int(sell_revenue * 0.8)
    buy_price = all_prices[buy_ticker]["price"]
    buy_exec_price, _ = calc_fees(buy_ticker, buy_price, 1, "buy")
    buy_shares = buy_budget // buy_exec_price
    if buy_shares <= 0:
        # 매수 불가 시 매도만 확정
        save_portfolio(INVESTOR_ID, portfolio)
        supabase.table("transactions").insert({
            "investor_id": INVESTOR_ID, "date": date_str, "type": "sell",
            "ticker": sell_ticker, "name": sell_name, "shares": sell_shares,
            "price": sell_exec_price, "amount": sell_revenue, "fee": sell_fee,
            "profit": sell_profit,
        }).execute()
        sell_pct = (sell_exec_price / sell_info["avg_price"] - 1) * 100
        return {"sell": sell_ticker, "buy": None, "sell_pct": sell_pct,
                "sell_name": sell_name, "sell_shares": sell_shares}

    buy_exec_price, buy_fee = calc_fees(buy_ticker, buy_price, buy_shares, "buy")
    buy_cost = buy_shares * buy_exec_price + buy_fee
    buy_name = all_prices[buy_ticker]["name"]

    portfolio["cash"] -= buy_cost
    portfolio["holdings"][buy_ticker] = {
        "name": buy_name,
        "shares": buy_shares,
        "avg_price": buy_exec_price,
    }

    save_portfolio(INVESTOR_ID, portfolio)

    # 거래 기록 저장
    supabase.table("transactions").insert([
        {
            "investor_id": INVESTOR_ID, "date": date_str, "type": "sell",
            "ticker": sell_ticker, "name": sell_name, "shares": sell_shares,
            "price": sell_exec_price, "amount": sell_revenue, "fee": sell_fee,
            "profit": sell_profit,
        },
        {
            "investor_id": INVESTOR_ID, "date": date_str, "type": "buy",
            "ticker": buy_ticker, "name": buy_name, "shares": buy_shares,
            "price": buy_exec_price, "amount": buy_shares * buy_exec_price,
            "fee": buy_fee, "profit": 0,
        },
    ]).execute()

    sell_pct = (sell_exec_price / sell_info["avg_price"] - 1) * 100
    return {
        "sell": sell_ticker, "sell_name": sell_name, "sell_shares": sell_shares,
        "sell_pct": sell_pct,
        "buy": buy_ticker, "buy_name": buy_name, "buy_shares": buy_shares,
        "buy_change_pct": all_prices[buy_ticker]["change_pct"],
        "buy_vol_ratio": round(all_prices[buy_ticker]["volume"] / max(all_prices[buy_ticker].get("prev_volume", 1), 1), 1),
    }


def run_monitor(dry_run=False):
    """메인 모니터링 루프"""
    today_str = date.today().isoformat()
    prev_total_asset = get_prev_total_asset()
    logger.info(f"O 정익절 모니터링 시작 ({today_str}, 전일 자산: {prev_total_asset:,}원, dry_run={dry_run})")
    notify(f"👁️ *정익절 모니터링 시작* ({today_str})\n전일 자산: {prev_total_asset:,}원 | 익절 +5% = {int(prev_total_asset * 1.05):,}원 | 종목별 손절 -3%")

    check_count = 0
    total_trades = []

    # 능동 트레이딩 상태
    daily_swap_count = 0
    consecutive_loss_swaps = 0
    buy_check_map = {}  # {ticker: check_count} — 매수 시점 기록

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

        # 100종목 전체 병렬 조회 (능동 트레이딩 + 방어 로직 공용)
        try:
            all_prices = get_stock_prices_parallel()
        except Exception as e:
            logger.error(f"[#{check_count}] 가격 조회 실패: {e}")
            time.sleep(CHECK_INTERVAL)
            continue

        if not holdings:
            logger.info(f"[#{check_count}] 보유종목 없음 — 대기")
            time.sleep(CHECK_INTERVAL)
            continue

        # 보유종목 가격 필터
        prices = {t: all_prices[t] for t in holdings if t in all_prices}

        # 총자산 계산
        eval_amount = sum(
            holdings[t]["shares"] * prices[t]["price"]
            for t in holdings if t in prices
        )
        total_asset = portfolio["cash"] + eval_amount
        daily_return_pct = (total_asset / prev_total_asset - 1) * 100 if prev_total_asset > 0 else 0

        logger.info(
            f"[#{check_count}] 총자산: {total_asset:,.0f}원 "
            f"(전일 대비 {daily_return_pct:+.2f}%) "
            f"현금: {portfolio['cash']:,.0f}원 | 종목수: {len(holdings)}"
        )

        # === Phase 1: 기존 방어 로직 (매 사이클) ===

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
                refresh_daily_report(all_prices, today_str)
                portfolio = load_portfolio(INVESTOR_ID)
                holdings = portfolio.get("holdings", {})
        else:
            for ticker in list(holdings.keys()):
                if ticker in prices:
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
                    refresh_daily_report(all_prices, today_str)
            else:
                logger.info(f"  [dry-run] 전 종목 매도 스킵")

            time.sleep(CHECK_INTERVAL)
            continue  # 익절 후 능동 트레이딩 스킵

        # === Phase 2: 능동 트레이딩 (30분 간격) ===
        can_active_trade = (
            check_count % ACTIVE_CHECK_INTERVAL == 0
            and is_active_trading_hours()
            and daily_swap_count < MAX_DAILY_SWAPS
            and consecutive_loss_swaps < 2
            and len(holdings) >= 3  # 최소 종목 수 유지
        )

        if can_active_trade:
            logger.info(f"  🔍 능동 트레이딩 스캔 (교체 {daily_swap_count}/{MAX_DAILY_SWAPS})")

            sell_target = check_momentum_exit(holdings, all_prices, buy_check_map, check_count)

            if sell_target:
                sell_name = holdings[sell_target]["name"]
                sell_pct = all_prices[sell_target]["change_pct"] if sell_target in all_prices else 0
                logger.info(f"  📉 매도 후보: {sell_name}({sell_target}) 당일 {sell_pct:+.1f}%")

                buy_candidate = find_surge_candidate(all_prices, holdings)

                if buy_candidate:
                    buy_name = all_prices[buy_candidate]["name"]
                    buy_pct = all_prices[buy_candidate]["change_pct"]
                    logger.info(f"  📈 매수 후보: {buy_name}({buy_candidate}) 당일 {buy_pct:+.1f}%")

                    # 유동성 체크: 매도/매수 종목의 당일 거래량이 전일의 30% 미만이면 스킵
                    sell_p = all_prices.get(sell_target, {})
                    buy_p = all_prices.get(buy_candidate, {})
                    sell_liq_ok = sell_p.get("prev_volume", 0) <= 0 or sell_p.get("volume", 0) >= sell_p.get("prev_volume", 1) * MIN_LIQUIDITY_RATIO
                    buy_liq_ok = buy_p.get("prev_volume", 0) <= 0 or buy_p.get("volume", 0) >= buy_p.get("prev_volume", 1) * MIN_LIQUIDITY_RATIO
                    if not (sell_liq_ok and buy_liq_ok):
                        low_liq = sell_name if not sell_liq_ok else buy_name
                        logger.info(f"  ⚠️ 유동성 부족 → 교체 스킵 ({low_liq})")
                    elif not dry_run:
                        result = execute_swap(portfolio, sell_target, buy_candidate, all_prices, today_str)
                        if result and result.get("buy"):
                            daily_swap_count += 1
                            buy_check_map[buy_candidate] = check_count

                            # 연속 손실 추적
                            if result["sell_pct"] < 0:
                                consecutive_loss_swaps += 1
                            else:
                                consecutive_loss_swaps = 0

                            vol_ratio = result["buy_vol_ratio"]
                            msg = (
                                f"🔄 *정익절 종목 교체* ({datetime.now().strftime('%H:%M')})\n"
                                f"매도: {result['sell_name']} {result['sell_shares']}주 ({result['sell_pct']:+.1f}%)\n"
                                f"매수: {result['buy_name']} {result['buy_shares']}주 "
                                f"(당일 {result['buy_change_pct']:+.1f}%, 거래량 {vol_ratio}x)\n"
                                f"교체 {daily_swap_count}/{MAX_DAILY_SWAPS}"
                            )
                            notify(msg)
                            refresh_daily_report(all_prices, today_str)
                            logger.info(f"  ✅ 교체 완료 ({daily_swap_count}/{MAX_DAILY_SWAPS})")
                        elif result:
                            logger.info(f"  ⚠️ 매도만 실행: {result.get('sell_name', result['sell'])} ({result.get('sell_pct', 0):+.1f}%)")
                            if result.get("sell_pct", 0) < 0:
                                consecutive_loss_swaps += 1
                            else:
                                consecutive_loss_swaps = 0
                            refresh_daily_report(all_prices, today_str)
                            daily_swap_count += 1
                    else:
                        logger.info(f"  [dry-run] 교체: {sell_name} → {buy_name}")
                else:
                    logger.info(f"  ❌ 매수 후보 없음 — 교체 스킵")
            else:
                logger.info(f"  ✅ 모멘텀 이탈 종목 없음")

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
