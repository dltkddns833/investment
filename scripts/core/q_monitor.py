"""Q 정채원 장중 7세션 스캘핑 모니터링

이슈 #57 Q 정채원 전략:
  - 7세션: 09:00 / 10:00 / 11:00 / 12:00 / 13:00 / 14:00 / 15:00 매수
  - 각 세션: XX:55 종목 선정 → XX:00 시장가 매수 → 2분 간격 5회 체크 → XX:10 강제 청산
  - 첫 세션(09:00)은 08:50 ATS(시간외 단일가)로 선정, 데이터 부족 시 09:00 정규장 fallback
  - 익절: 매수가 대비 +5% / 손절: 매수가 대비 -3%
  - 자본: 복리 + 1,000만원 캡 (캡 초과분은 현금으로 보유)
  - 종목 범위: KOSPI + KOSDAQ 전체 (stock_universe 무관)
  - 종목 선정: 전일 종가 +10% 초과 ~ +15% 미만 + 전일 종가 ≥ 2,000원
              + 직전 1시간 거래량 vs 전일 동시간대 거래량 증가율 최대 1개

Usage:
    python3 scripts/core/q_monitor.py              # 실행
    python3 scripts/core/q_monitor.py --dry-run     # 매매 없이 로그만
"""
import sys
import time
import argparse
from datetime import datetime, date, timedelta
from pathlib import Path

import holidays

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "notifications"))

from supabase_client import supabase
from portfolio import load_portfolio, load_profile, save_portfolio, evaluate, calc_fees
from broker_client import KISClient
from safety import check_kill_switch
from daily_pipeline import notify
from logger import get_logger

logger = get_logger("q_monitor")

INVESTOR_ID = "Q"
TAKE_PROFIT_PCT = 5.0          # 매수가 대비 +5% 전 종목 익절
STOP_LOSS_PCT = -3.0            # 매수가 대비 -3% 전 종목 손절
MAX_CAPITAL_PER_SESSION = 10_000_000  # 세션당 매수 자본 캡
MIN_PREV_CLOSE = 2000           # 전일 종가 2,000원 미만 제외
SURGE_RATE_MIN = 10.0           # 등락률 하한 (+10% 초과)
SURGE_RATE_MAX = 15.0           # 등락률 상한 (+15% 미만)

# 세션 구조: (select_min_offset, buy_hh) — buy 시각 5분 전이 select
# 첫 세션은 buy_hh=9, select는 08:50 (정규장 직전 ATS)
SESSION_BUY_HOURS = [9, 10, 11, 12, 13, 14, 15]
SELECT_LEAD_MIN = 5             # XX:55 = XX:00 - 5분
HOLD_DURATION_MIN = 10          # XX:00 ~ XX:10
CHECK_INTERVAL_MIN = 2          # 2분 간격 모니터링

KR_HOLIDAYS = holidays.KR()


# --- 시간 유틸 ---

def prev_business_day(today):
    """전 거래일 (KR 공휴일 + 주말 제외)"""
    d = today - timedelta(days=1)
    while d.weekday() >= 5 or d in KR_HOLIDAYS:
        d -= timedelta(days=1)
    return d


def is_business_day(d):
    return d.weekday() < 5 and d not in KR_HOLIDAYS


def wait_until(target_dt, label=""):
    """목표 시각까지 sleep (60초마다 깨어나 킬스위치 체크)"""
    now = datetime.now()
    if target_dt <= now:
        return True
    while datetime.now() < target_dt:
        if check_kill_switch():
            logger.warning(f"킬스위치 활성화 ({label}) — 대기 중단")
            return False
        remaining = (target_dt - datetime.now()).total_seconds()
        time.sleep(min(60, max(1, remaining)))
    return True


def session_times(today, buy_hh):
    """(select_dt, buy_dt, close_dt) 반환"""
    buy_dt = datetime.combine(today, datetime.min.time()).replace(hour=buy_hh, minute=0)
    if buy_hh == 9:
        # 첫 세션: 08:50 ATS 선정
        select_dt = buy_dt.replace(hour=8, minute=50)
    else:
        select_dt = buy_dt - timedelta(minutes=SELECT_LEAD_MIN)
    close_dt = buy_dt + timedelta(minutes=HOLD_DURATION_MIN)
    return select_dt, buy_dt, close_dt


# --- 티커 변환 ---

def kis_to_yf_ticker(code, market_name=""):
    """KIS 6자리 코드 → yfinance 형식. market_name=rprs_mrkt_kor_name"""
    if not market_name:
        return f"{code}.KS"
    upper = market_name.upper()
    if "KSQ" in upper or "KOSDAQ" in upper:
        return f"{code}.KQ"
    return f"{code}.KS"


def resolve_ticker(client, code):
    """code → (yf_ticker, name). KIS 현재가 한 번 조회로 시장구분 확인"""
    try:
        info = client.get_current_price(code)
        return None, info  # 시장명은 별도 조회 필요
    except Exception:
        return f"{code}.KS", {"name": code, "price": 0}


def fetch_market_name(client, code):
    """KIS 현재가 응답에서 rprs_mrkt_kor_name 직접 조회"""
    import requests
    url = f"{client.base_url}/uapi/domestic-stock/v1/quotations/inquire-price"
    params = {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": code}
    resp = requests.get(url, headers=client._headers("FHKST01010100"), params=params, timeout=10)
    data = resp.json()
    o = data.get("output", {})
    return o.get("rprs_mrkt_kor_name", ""), o.get("hts_kor_isnm", "") or code, int(o.get("stck_prpr", 0))


# --- 종목 선정 ---

def pick_first_session_stock(client):
    """08:50 ATS — 시간외 단일가 등락률 +10~15% & 전일종가 ≥2,000원, 거래량 큰 1개"""
    try:
        candidates = client.get_overtime_surge_stocks(market_iscd="0000", div_cls="2", max_count=30)
    except Exception as e:
        logger.warning(f"  ATS 조회 실패: {e}")
        return None

    filtered = []
    for c in candidates:
        rate = c.get("overtime_change_pct", 0)
        price = c.get("overtime_price", 0)
        if SURGE_RATE_MIN < rate < SURGE_RATE_MAX and price >= MIN_PREV_CLOSE:
            filtered.append(c)

    if not filtered:
        logger.info("  [ATS] +10~15% 시간외 종목 없음")
        return None

    # 시간외 거래량 큰 순으로 1개 (ATS는 분봉 비교 어려움 — 단순화)
    filtered.sort(key=lambda x: x.get("overtime_volume", 0), reverse=True)
    top = filtered[0]
    logger.info(f"  [ATS] 선정: {top['name']}({top['code']}) 시간외 {top['overtime_change_pct']:+.1f}%, 거래량 {top['overtime_volume']:,}")
    return top


def pick_regular_session_stock(client, buy_hh, today):
    """일반 세션 종목 선정 (3단계 필터)"""
    # 1차 필터: 등락률 +10~15%
    try:
        candidates = client.get_surge_stocks(
            rate_min=SURGE_RATE_MIN, rate_max=SURGE_RATE_MAX,
            min_volume=100000, max_count=30, exclude_special=True,
        )
    except Exception as e:
        logger.warning(f"  등락률 순위 조회 실패: {e}")
        return None

    if not candidates:
        logger.info(f"  +{SURGE_RATE_MIN}~{SURGE_RATE_MAX}% 종목 없음")
        return None

    # 2차 필터: 전일 종가 환산 (현재가 / (1 + change_pct/100))로 추정
    pre_filtered = []
    for c in candidates:
        rate = c.get("change_pct", 0)
        cur_price = c.get("price", 0)
        prev_close = cur_price / (1 + rate / 100) if rate > -100 else 0
        if prev_close >= MIN_PREV_CLOSE:
            c["prev_close_est"] = int(prev_close)
            pre_filtered.append(c)

    if not pre_filtered:
        logger.info(f"  전일 종가 ≥{MIN_PREV_CLOSE}원 종목 없음")
        return None

    # 3차 필터: N-1시간 거래량 vs 전일 동시간대 거래량 증가율 최대
    n_minus_1 = buy_hh - 1
    start_hhmm = f"{n_minus_1:02d}00"
    end_hhmm = f"{n_minus_1:02d}55"
    today_str = today.strftime("%Y%m%d")
    yday_str = prev_business_day(today).strftime("%Y%m%d")

    best = None
    best_ratio = 0
    for c in pre_filtered:
        try:
            today_v = client.get_volume_in_window(c["code"], today_str, start_hhmm, end_hhmm)
            yday_v = client.get_volume_in_window(c["code"], yday_str, start_hhmm, end_hhmm)
        except Exception as e:
            logger.warning(f"  분봉 조회 실패 ({c['code']}): {e}")
            continue
        if yday_v <= 0:
            continue
        ratio = today_v / yday_v
        if ratio > best_ratio:
            best_ratio = ratio
            c["volume_ratio"] = ratio
            c["today_window_vol"] = today_v
            c["yday_window_vol"] = yday_v
            best = c

    if not best:
        logger.info(f"  거래량 비교 가능 종목 없음 — 단순 등락률 1위로 fallback")
        # fallback: 등락률 1위
        pre_filtered.sort(key=lambda x: x.get("change_pct", 0), reverse=True)
        return pre_filtered[0]

    logger.info(
        f"  선정: {best['name']}({best['code']}) {best.get('change_pct', 0):+.1f}%, "
        f"거래량 비교 {best.get('today_window_vol', 0):,}/{best.get('yday_window_vol', 0):,} "
        f"= {best_ratio:.1f}x"
    )
    return best


# --- 매매 실행 ---

def execute_buy(client, code, name_hint, today_str, dry_run=False):
    """시장가 매수 — capital = min(cash, 1,000만원). holdings에 1종목만 보유.
    Returns: (ticker, name, exec_price, shares) 또는 None
    """
    portfolio = load_portfolio(INVESTOR_ID)
    cash = portfolio["cash"]
    capital = min(cash, MAX_CAPITAL_PER_SESSION)

    # 시장구분 + 종목명 + 현재가 조회 (1회)
    try:
        market_name, kis_name, current_price = fetch_market_name(client, code)
    except Exception as e:
        logger.warning(f"  현재가 조회 실패: {e}")
        return None

    if current_price <= 0:
        logger.warning(f"  현재가 0 — 매수 스킵")
        return None

    name = kis_name or name_hint or code
    ticker = kis_to_yf_ticker(code, market_name)

    # 슬리피지 반영 체결가 추정 + 매수 수량
    exec_price_est, _ = calc_fees(ticker, current_price, 1, "buy")
    shares = capital // exec_price_est
    if shares <= 0:
        logger.warning(f"  매수 수량 0 — 자본 부족 ({capital:,}원, 체결가 {exec_price_est:,}원)")
        return None

    # 실제 fee 재계산
    exec_price, fee = calc_fees(ticker, current_price, shares, "buy")
    cost = shares * exec_price
    total_cost = cost + fee
    if total_cost > cash:
        # 자본 캡 또는 현금 부족 → 1주씩 줄여 재시도
        while shares > 0:
            shares -= 1
            exec_price, fee = calc_fees(ticker, current_price, shares, "buy")
            cost = shares * exec_price
            total_cost = cost + fee
            if total_cost <= cash:
                break
    if shares <= 0:
        logger.warning(f"  매수 불가 — 현금 부족")
        return None

    if dry_run:
        logger.info(f"  [dry-run] BUY {name}({code}) {shares}주 × {exec_price:,}원 = {cost:,}원")
        return ticker, name, exec_price, shares

    # 실거래
    portfolio["cash"] = cash - total_cost
    portfolio["holdings"][ticker] = {
        "name": name,
        "shares": shares,
        "avg_price": exec_price,
    }
    supabase.table("transactions").insert({
        "investor_id": INVESTOR_ID, "date": today_str, "type": "buy",
        "ticker": ticker, "name": name, "shares": shares,
        "price": exec_price, "amount": cost, "fee": fee,
    }).execute()
    save_portfolio(INVESTOR_ID, portfolio)
    logger.info(f"  ✅ BUY {name}({ticker}) {shares}주 × {exec_price:,}원 = {cost:,}원")
    return ticker, name, exec_price, shares


def execute_sell_all(client, today_str, reason, dry_run=False):
    """현재 보유 종목 전량 매도. 시세는 KIS get_current_price로 즉시 조회.
    Returns: list of trade dicts
    """
    portfolio = load_portfolio(INVESTOR_ID)
    holdings = portfolio.get("holdings", {})
    if not holdings:
        return []

    trades = []
    pending = []
    for ticker in list(holdings.keys()):
        h = holdings[ticker]
        code = ticker.split(".")[0]
        try:
            info = client.get_current_price(code)
            current_price = info["price"]
        except Exception as e:
            logger.warning(f"  매도 시세 조회 실패 ({ticker}): {e}")
            continue
        if current_price <= 0:
            continue
        sell_shares = h["shares"]
        exec_price, fee = calc_fees(ticker, current_price, sell_shares, "sell")
        revenue = sell_shares * exec_price
        profit = (exec_price - h["avg_price"]) * sell_shares
        name = h["name"]

        if dry_run:
            pct = (exec_price / h["avg_price"] - 1) * 100
            logger.info(f"  [dry-run] SELL {name}({ticker}) {sell_shares}주 × {exec_price:,}원 ({pct:+.2f}%, {reason})")
            trades.append({"ticker": ticker, "name": name, "shares": sell_shares,
                           "price": exec_price, "profit": profit, "reason": reason})
            continue

        portfolio["cash"] += revenue - fee
        del portfolio["holdings"][ticker]
        pending.append({
            "investor_id": INVESTOR_ID, "date": today_str, "type": "sell",
            "ticker": ticker, "name": name, "shares": sell_shares,
            "price": exec_price, "amount": revenue, "fee": fee, "profit": profit,
        })
        pct = (exec_price / h["avg_price"] - 1) * 100
        trades.append({"ticker": ticker, "name": name, "shares": sell_shares,
                       "price": exec_price, "profit": profit, "pct": pct, "reason": reason})
        logger.info(f"  ✅ SELL {name}({ticker}) {sell_shares}주 × {exec_price:,}원 ({pct:+.2f}%, {reason})")

    if pending and not dry_run:
        supabase.table("transactions").insert(pending).execute()
        save_portfolio(INVESTOR_ID, portfolio)
    return trades


# --- 모니터링 / 리포트 ---

def monitor_session(client, ticker, buy_dt, close_dt, dry_run=False):
    """매수 직후부터 close_dt까지 2분 간격으로 익절/손절 체크.
    Returns: ("take_profit" | "stop_loss" | "force_close" | "none", trades, exit_pct)
    """
    portfolio = load_portfolio(INVESTOR_ID)
    h = portfolio["holdings"].get(ticker)
    if not h:
        return ("none", [], 0)
    avg_price = h["avg_price"]
    code = ticker.split(".")[0]

    # 체크 시각: buy_dt + 2, 4, 6, 8 minutes (5회: 0,2,4,6,8 — 단 0은 매수 직후라 제외하고 close_dt가 종료)
    check_offsets_min = [CHECK_INTERVAL_MIN * i for i in range(1, HOLD_DURATION_MIN // CHECK_INTERVAL_MIN + 1)]
    today_str = buy_dt.date().isoformat()

    for offset in check_offsets_min:
        check_dt = buy_dt + timedelta(minutes=offset)
        if check_dt >= close_dt:
            break
        if not wait_until(check_dt, label=f"check +{offset}m"):
            return ("kill_switch", [], 0)

        try:
            info = client.get_current_price(code)
            current_price = info["price"]
        except Exception as e:
            logger.warning(f"  [+{offset}m] 시세 조회 실패: {e}")
            continue
        if current_price <= 0:
            continue
        pct = (current_price / avg_price - 1) * 100
        logger.info(f"  [+{offset}m] {h['name']} {current_price:,}원 ({pct:+.2f}%)")

        if pct >= TAKE_PROFIT_PCT:
            trades = execute_sell_all(client, today_str, f"익절 ({pct:+.2f}%)", dry_run=dry_run)
            return ("take_profit", trades, pct)
        if pct <= STOP_LOSS_PCT:
            trades = execute_sell_all(client, today_str, f"손절 ({pct:+.2f}%)", dry_run=dry_run)
            return ("stop_loss", trades, pct)

    # 모니터링 종료까지 익절/손절 미발생 → close_dt에 강제 청산
    if not wait_until(close_dt, label="force close"):
        return ("kill_switch", [], 0)

    try:
        info = client.get_current_price(code)
        current_price = info["price"]
        final_pct = (current_price / avg_price - 1) * 100
    except Exception:
        final_pct = 0

    trades = execute_sell_all(client, today_str, f"강제 청산 ({final_pct:+.2f}%)", dry_run=dry_run)
    return ("force_close", trades, final_pct)


def refresh_daily_report(date_str):
    """Q 매매 후 daily_reports & portfolio_snapshots 갱신. 가격은 holdings 시세를 KIS로 즉시 조회.

    holdings가 비어있어도 cash 기준 평가 결과를 갱신한다.
    """
    try:
        client = KISClient()
        portfolio = load_portfolio(INVESTOR_ID)
        holdings = portfolio.get("holdings", {})
        prices = {}
        for ticker in holdings:
            code = ticker.split(".")[0]
            try:
                info = client.get_current_price(code)
                prices[ticker] = {"price": info["price"], "name": info.get("name", "")}
            except Exception:
                prices[ticker] = {"price": holdings[ticker]["avg_price"], "name": holdings[ticker]["name"]}

        result = evaluate(INVESTOR_ID, prices)
        profile = load_profile(INVESTOR_ID)

        existing = supabase.table("daily_reports").select("*").eq("date", date_str).execute().data
        if not existing:
            return
        report = existing[0]
        investor_name = result["investor"]
        prev_detail = report["investor_details"].get(investor_name, {})
        result["rebalance_frequency_days"] = profile["rebalance_frequency_days"]
        result["rebalanced_today"] = prev_detail.get("rebalanced_today", False)
        result["total_rebalances"] = prev_detail.get("total_rebalances", 0)

        txns = supabase.table("transactions").select("type,ticker,shares,price").eq(
            "investor_id", INVESTOR_ID).eq("date", date_str).execute().data or []
        result["trades_today"] = txns

        report["investor_details"][investor_name] = result

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

        supabase.table("portfolio_snapshots").upsert({
            "investor_id": INVESTOR_ID,
            "date": date_str,
            "holdings": result["holdings"],
            "cash": portfolio["cash"],
            "total_asset": result["total_asset"],
            "snapshot_at": datetime.now().isoformat(),
        }).execute()
        logger.info(f"  📊 daily_reports 갱신 (자산 {result['total_asset']:,}원)")
    except Exception as e:
        logger.error(f"  daily_reports 갱신 실패: {e}")


# --- 메인 ---

def run_monitor(dry_run=False):
    today = date.today()
    today_str = today.isoformat()
    if not is_business_day(today):
        logger.info(f"휴장일 ({today_str}) — Q 모니터링 스킵")
        return

    client = KISClient()
    notify(f"⚡ *정채원 모니터링 시작* ({today_str}) — 7세션 스캘핑 (dry_run={dry_run})")
    logger.info(f"Q 정채원 모니터링 시작 ({today_str}, dry_run={dry_run})")

    summary = []  # 각 세션의 결과 저장

    for session_idx, buy_hh in enumerate(SESSION_BUY_HOURS, start=1):
        select_dt, buy_dt, close_dt = session_times(today, buy_hh)

        # 종료된 세션은 스킵
        if datetime.now() >= close_dt:
            logger.info(f"[S{session_idx}] {buy_hh:02d}:00 세션 — 이미 종료, 스킵")
            continue

        if check_kill_switch():
            logger.warning("킬스위치 활성화 — 모니터링 중단")
            notify("🛑 정채원: 킬스위치 활성화로 중단")
            break

        # 1) 종목 선정 — select_dt까지 대기
        logger.info(f"\n[S{session_idx}] {buy_hh:02d}:00 세션 — 선정 시각 {select_dt.strftime('%H:%M')}")
        if not wait_until(select_dt, label=f"S{session_idx} select"):
            break

        if buy_hh == 9:
            picked = pick_first_session_stock(client)
            # ATS 빈손 → 09:00 정규장 데이터 fallback
            if not picked:
                logger.info(f"  [ATS fallback] 09:00 정규장으로 종목 선정 시도")
                if not wait_until(buy_dt, label=f"S{session_idx} fallback to buy_dt"):
                    break
                picked = pick_regular_session_stock(client, buy_hh, today)
        else:
            picked = pick_regular_session_stock(client, buy_hh, today)

        if not picked:
            logger.info(f"  [S{session_idx}] 후보 없음 — 세션 스킵")
            summary.append(f"S{session_idx} {buy_hh:02d}:00 — 스킵 (후보 없음)")
            continue

        # 2) 매수 시각까지 대기 (이미 buy_dt를 지났으면 즉시)
        if datetime.now() < buy_dt:
            if not wait_until(buy_dt, label=f"S{session_idx} buy"):
                break

        # 3) 매수
        bought = execute_buy(client, picked["code"], picked.get("name", ""), today_str, dry_run=dry_run)
        if not bought:
            logger.info(f"  [S{session_idx}] 매수 실패 — 세션 스킵")
            summary.append(f"S{session_idx} {buy_hh:02d}:00 — 매수 실패")
            continue
        ticker, name, exec_price, shares = bought
        notify(
            f"⚡ *S{session_idx} {buy_hh:02d}:00 매수* {name}\n"
            f"{shares}주 × {exec_price:,}원 = {shares*exec_price:,}원 (코드 {picked['code']})"
        )
        if not dry_run:
            refresh_daily_report(today_str)

        # 4) 모니터링 + 강제 청산
        outcome, trades, pct = monitor_session(client, ticker, buy_dt, close_dt, dry_run=dry_run)

        if outcome == "kill_switch":
            notify("🛑 정채원: 킬스위치 활성화 — 모니터링 종료")
            break

        outcome_emoji = {"take_profit": "💰", "stop_loss": "🛑", "force_close": "⏰", "none": "⚠️"}
        emoji = outcome_emoji.get(outcome, "•")
        msg = f"{emoji} *S{session_idx} 청산* {name} ({pct:+.2f}%, {outcome})"
        notify(msg)
        summary.append(f"S{session_idx} {buy_hh:02d}:00 — {name} {pct:+.2f}% ({outcome})")
        if not dry_run:
            refresh_daily_report(today_str)

    # 종료 요약
    portfolio = load_portfolio(INVESTOR_ID)
    cash = portfolio["cash"]
    final = (
        f"⚡ *정채원 모니터링 종료* ({today_str})\n"
        f"현금: {cash:,}원\n"
        + "\n".join(f"• {s}" for s in summary)
    )
    notify(final)
    logger.info(final)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Q 정채원 7세션 스캘핑 모니터링")
    parser.add_argument("--dry-run", action="store_true", help="매매 없이 로그만")
    args = parser.parse_args()
    run_monitor(dry_run=args.dry_run)
