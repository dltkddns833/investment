"""실전 투자 안전 장치

메타 매니저의 안전 메커니즘: 손실 한도, 킬스위치, 배분 검증, 긴급 청산.
"""
import sys
from datetime import datetime
from pathlib import Path

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
