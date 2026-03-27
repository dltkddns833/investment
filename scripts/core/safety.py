"""실전 투자 안전 장치

메타 매니저의 안전 메커니즘: 손실 한도, 킬스위치, 배분 검증, 긴급 청산,
리밸런싱 주기, 손절/익절, 보유기간, 회전율, 안정화 기간.
"""
import sys
from datetime import datetime, timedelta
from pathlib import Path

import holidays

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "notifications"))

from supabase_client import supabase
from send_telegram import send_telegram
from logger import get_logger

logger = get_logger(__name__)

# --- 손실 한도 체크 ---

DAILY_LOSS_LIMIT_PCT = -3.0
CUMULATIVE_LOSS_LIMIT_PCT = -10.0
MAX_SINGLE_STOCK_PCT = 30.0


def check_daily_loss(current_total, prev_total):
    """일일 손실 -3% 초과 여부 체크

    Returns:
        True이면 거래 중단 필요
    """
    if prev_total <= 0:
        return False
    daily_pct = (current_total / prev_total - 1) * 100
    if daily_pct <= DAILY_LOSS_LIMIT_PCT:
        logger.warning(f"일일 손실 한도 초과: {daily_pct:.2f}% (한도: {DAILY_LOSS_LIMIT_PCT}%)")
        return True
    return False


def check_cumulative_loss(current_total, initial_capital):
    """누적 손실 -10% 초과 여부 체크

    Returns:
        True이면 전량 청산 필요
    """
    if initial_capital <= 0:
        return False
    cum_pct = (current_total / initial_capital - 1) * 100
    if cum_pct <= CUMULATIVE_LOSS_LIMIT_PCT:
        logger.warning(f"누적 손실 한도 초과: {cum_pct:.2f}% (한도: {CUMULATIVE_LOSS_LIMIT_PCT}%)")
        return True
    return False


# --- 킬스위치 ---

def check_kill_switch():
    """Supabase config 테이블에서 킬스위치 상태 확인

    Returns:
        True이면 거래 중단
    """
    try:
        row = supabase.table("config").select("risk_limits").eq("id", 1).single().execute().data
        risk_limits = row.get("risk_limits", {})
        meta_config = risk_limits.get("meta_manager", {})
        return meta_config.get("kill_switch", False)
    except Exception as e:
        logger.error(f"킬스위치 확인 실패: {e}")
        # 안전을 위해 확인 불가 시 True 반환 (중단)
        return True


def set_kill_switch(active):
    """킬스위치 설정/해제"""
    try:
        row = supabase.table("config").select("risk_limits").eq("id", 1).single().execute().data
        risk_limits = row.get("risk_limits", {})
        if "meta_manager" not in risk_limits:
            risk_limits["meta_manager"] = {}
        risk_limits["meta_manager"]["kill_switch"] = active
        supabase.table("config").update({"risk_limits": risk_limits}).eq("id", 1).execute()
        state = "활성화" if active else "해제"
        logger.info(f"킬스위치 {state}")
        send_telegram(f"\U0001f6d1 킬스위치 {state}")
    except Exception as e:
        logger.error(f"킬스위치 설정 실패: {e}")
        raise


# --- 배분 검증 ---

def validate_meta_allocation(allocation):
    """메타 매니저 배분 검증

    Args:
        allocation: {ticker: weight, ...} (0~1.0)

    Returns:
        (adjusted_allocation, violations)
    """
    violations = []
    adjusted = dict(allocation)
    max_ratio = MAX_SINGLE_STOCK_PCT / 100.0

    # 1. 단일 종목 비중 제한 (30%)
    for ticker, weight in list(adjusted.items()):
        if weight > max_ratio:
            violations.append({
                "type": "단일종목초과",
                "detail": f"{ticker} {weight*100:.1f}% → {MAX_SINGLE_STOCK_PCT:.0f}%",
            })
            adjusted[ticker] = max_ratio

    # 2. 배분 합계 검증 (> 1.0 불가)
    total = sum(adjusted.values())
    if total > 1.0:
        scale = 1.0 / total
        adjusted = {t: round(w * scale, 4) for t, w in adjusted.items()}
        violations.append({
            "type": "배분초과",
            "detail": f"배분합계 {total*100:.1f}% → 100.0%",
        })

    # 3. 최소 현금 5%
    total = sum(adjusted.values())
    if total > 0.95:
        scale = 0.95 / total
        adjusted = {t: round(w * scale, 4) for t, w in adjusted.items()}
        violations.append({
            "type": "현금부족",
            "detail": f"배분합계 {total*100:.1f}% → 95.0% (최소 현금 5%)",
        })

    if violations:
        logger.warning(f"메타 배분 검증 위반 {len(violations)}건: {violations}")

    return adjusted, violations


# --- 장 운영시간 체크 ---

def is_trading_hours():
    """현재 주문 가능 시간인지 (09:00~15:20 KST, 평일)"""
    now = datetime.now()
    if now.weekday() >= 5:
        return False
    market_open = now.replace(hour=9, minute=0, second=0, microsecond=0)
    order_cutoff = now.replace(hour=15, minute=20, second=0, microsecond=0)
    return market_open <= now <= order_cutoff


# --- 긴급 청산 ---

def emergency_liquidate(kis_client, holdings):
    """전체 보유종목 시장가 매도

    Args:
        kis_client: KISClient 인스턴스
        holdings: get_holdings() 결과

    Returns:
        [{"code": str, "qty": int, "order_no": str, "status": str}, ...]
    """
    results = []
    for h in holdings:
        code = h.get("code", "")
        shares = h.get("shares", 0)
        if shares <= 0 or not code:
            continue
        try:
            order = kis_client.place_order(code, shares, price=0, side="sell")
            results.append({
                "code": code,
                "name": h.get("name", ""),
                "qty": shares,
                "order_no": order.get("order_no", ""),
                "status": "submitted",
            })
            logger.info(f"긴급 매도: {h.get('name', code)} x{shares}")
        except Exception as e:
            results.append({
                "code": code,
                "name": h.get("name", ""),
                "qty": shares,
                "order_no": "",
                "status": f"failed: {e}",
            })
            logger.error(f"긴급 매도 실패: {h.get('name', code)} — {e}")

    if results:
        msg_lines = ["\U0001f6a8 *긴급 청산 실행*"]
        for r in results:
            emoji = "\u2705" if r["status"] == "submitted" else "\u274c"
            msg_lines.append(f"{emoji} {r['name']} x{r['qty']} — {r['status']}")
        send_telegram("\n".join(msg_lines))

    return results


# --- 실전 포트폴리오 조회 ---

def get_prev_real_portfolio():
    """전일 실전 포트폴리오 조회"""
    try:
        result = (
            supabase.table("real_portfolio")
            .select("*")
            .order("date", desc=True)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]
    except Exception as e:
        logger.error(f"전일 실전 포트폴리오 조회 실패: {e}")
    return None


# --- 메타 매니저 설정 관리 ---

# 안정화 기간 대형주 30개 (stock_universe 내 시가총액 상위)
STABILIZATION_LARGE_CAPS = {
    "005930.KS",  # 삼성전자
    "000660.KS",  # SK하이닉스
    "373220.KS",  # LG에너지솔루션
    "207940.KS",  # 삼성바이오로직스
    "005380.KS",  # 현대자동차
    "000270.KS",  # 기아
    "068270.KS",  # 셀트리온
    "035420.KS",  # NAVER
    "035720.KS",  # 카카오
    "005490.KS",  # POSCO홀딩스
    "051910.KS",  # LG화학
    "006400.KS",  # 삼성SDI
    "055550.KS",  # 신한지주
    "105560.KS",  # KB금융
    "086790.KS",  # 하나금융지주
    "028260.KS",  # 삼성물산
    "012330.KS",  # 현대모비스
    "032830.KS",  # 삼성생명
    "000810.KS",  # 삼성화재
    "066570.KS",  # LG전자
    "017670.KS",  # SK텔레콤
    "030200.KS",  # KT
    "259960.KS",  # 크래프톤
    "329180.KS",  # HD현대중공업
    "012450.KS",  # 한화에어로스페이스
    "047810.KS",  # 한국항공우주
    "267260.KS",  # HD현대일렉트릭
    "009540.KS",  # HD한국조선해양
    "352820.KS",  # 하이브
    "097950.KS",  # CJ제일제당
}


def get_meta_config():
    """config.risk_limits.meta_manager JSONB 전체 로드"""
    try:
        row = supabase.table("config").select("risk_limits").eq("id", 1).single().execute().data
        return row.get("risk_limits", {}).get("meta_manager", {})
    except Exception as e:
        logger.error(f"메타 설정 로드 실패: {e}")
        return {}


def update_meta_config(updates):
    """config.risk_limits.meta_manager 부분 업데이트"""
    try:
        row = supabase.table("config").select("risk_limits").eq("id", 1).single().execute().data
        risk_limits = row.get("risk_limits", {})
        meta = risk_limits.get("meta_manager", {})
        meta.update(updates)
        risk_limits["meta_manager"] = meta
        supabase.table("config").update({"risk_limits": risk_limits}).eq("id", 1).execute()
        logger.info(f"메타 설정 업데이트: {list(updates.keys())}")
    except Exception as e:
        logger.error(f"메타 설정 업데이트 실패: {e}")
        raise


# --- 리밸런싱 주기 (#43) ---

def is_rebalance_day(date_str, meta_config=None):
    """오늘이 정규 리밸런싱 요일인지 (기본: 수요일)

    Args:
        date_str: "YYYY-MM-DD"
        meta_config: get_meta_config() 결과 (없으면 자동 로드)

    Returns:
        True이면 정규 리밸런싱 실행
    """
    if meta_config is None:
        meta_config = get_meta_config()

    target_day = meta_config.get("rebalance_day", "wednesday")
    day_map = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4}
    target_weekday = day_map.get(target_day, 2)

    d = datetime.strptime(date_str, "%Y-%m-%d")
    if d.weekday() != target_weekday:
        return False

    kr_holidays = holidays.KR(years=d.year)
    if d.date() in kr_holidays:
        return False

    return True


# --- 손절/익절 (#44) ---

def check_stop_loss_take_profit(current_holdings, meta_config=None):
    """종목별 -7% 손절 / +10% 익절 대상 분류

    Args:
        current_holdings: KIS get_holdings() 결과
        meta_config: get_meta_config() 결과

    Returns:
        {"stop_loss": [holdings...], "take_profit": [holdings...]}
    """
    if meta_config is None:
        meta_config = get_meta_config()

    sl_pct = meta_config.get("stop_loss_pct", -7)
    tp_pct = meta_config.get("take_profit_pct", 10)

    stop_loss = []
    take_profit = []
    for h in current_holdings:
        pnl = h.get("profit_pct", 0)
        if pnl <= sl_pct:
            stop_loss.append(h)
        elif pnl >= tp_pct:
            take_profit.append(h)

    return {"stop_loss": stop_loss, "take_profit": take_profit}


# --- 최소 보유 기간 (#45) ---

def _count_business_days(start_date, end_date):
    """두 날짜 사이의 영업일 수 계산 (공휴일 제외)"""
    if start_date >= end_date:
        return 0
    kr_holidays = holidays.KR(years=[start_date.year, end_date.year])
    count = 0
    current = start_date + timedelta(days=1)
    while current <= end_date:
        if current.weekday() < 5 and current not in kr_holidays:
            count += 1
        current += timedelta(days=1)
    return count


def check_holding_period(ticker, prev_holdings, date_str, meta_config=None):
    """최소 보유 기간 충족 여부 (3영업일)

    Args:
        ticker: 종목 티커
        prev_holdings: real_portfolio.holdings (acquired_date 포함)
        date_str: 오늘 날짜
        meta_config: get_meta_config() 결과

    Returns:
        True이면 매도 가능, False이면 보유 필수
    """
    if meta_config is None:
        meta_config = get_meta_config()

    min_days = meta_config.get("min_holding_days", 3)

    holding = prev_holdings.get(ticker, {})
    acquired = holding.get("acquired_date")
    if not acquired:
        return True  # acquired_date 없으면 매도 허용 (하위 호환)

    acq_date = datetime.strptime(acquired, "%Y-%m-%d").date()
    curr_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    bdays = _count_business_days(acq_date, curr_date)

    return bdays >= min_days


# --- 회전율 제한 (#46) ---

def enforce_turnover_limit(orders, total_asset, meta_config=None):
    """회전율 한도 초과 시 주문 비례 축소

    Args:
        orders: compute_orders() 결과
        total_asset: 총자산
        meta_config: get_meta_config() 결과

    Returns:
        (adjusted_orders, was_truncated)
    """
    if meta_config is None:
        meta_config = get_meta_config()

    max_turnover = meta_config.get("max_turnover_pct", 40)
    if total_asset <= 0:
        return orders, False

    sell_total = sum(o["qty"] * o["price"] for o in orders if o["side"] == "sell")
    buy_total = sum(o["qty"] * o["price"] for o in orders if o["side"] == "buy")
    turnover = (sell_total + buy_total) / total_asset * 100

    if turnover <= max_turnover:
        return orders, False

    # 비례 축소
    scale = max_turnover / turnover
    adjusted = []
    for o in orders:
        new_qty = max(1, int(o["qty"] * scale))
        adjusted.append({**o, "qty": new_qty})

    logger.warning(f"회전율 {turnover:.1f}% → {max_turnover}% 제한 (scale: {scale:.2f})")
    return adjusted, True


# --- 안정화 기간 (#47) ---

def is_stabilization_period(date_str, meta_config=None):
    """안정화 기간인지 확인

    Returns:
        True이면 대형주만 매매 가능
    """
    if meta_config is None:
        meta_config = get_meta_config()

    end_date = meta_config.get("stabilization_end_date")
    if not end_date:
        return False

    return date_str <= end_date


def get_stabilization_tickers():
    """안정화 기간 허용 종목 목록 (대형주 30개)"""
    return STABILIZATION_LARGE_CAPS


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="안전 장치 테스트")
    parser.add_argument("--kill-switch", choices=["on", "off"], help="킬스위치 설정")
    parser.add_argument("--status", action="store_true", help="킬스위치 상태 확인")
    args = parser.parse_args()

    if args.kill_switch:
        set_kill_switch(args.kill_switch == "on")
    elif args.status:
        active = check_kill_switch()
        print(f"킬스위치: {'활성화' if active else '해제'}")
    else:
        print(f"장 운영시간: {is_trading_hours()}")
        print(f"킬스위치: {'활성화' if check_kill_switch() else '해제'}")
