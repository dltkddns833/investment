"""리스크 관리 모듈 — 포지션 제한 검증 + 리스크 이벤트 감지 & 알림"""
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "notifications"))

from supabase_client import supabase
from send_telegram import send_telegram
from logger import get_logger

logger = get_logger(__name__)

_risk_limits_cache = None


def load_risk_limits():
    """config.risk_limits 로드 (캐시)"""
    global _risk_limits_cache
    if _risk_limits_cache is not None:
        return _risk_limits_cache
    row = supabase.table("config").select("risk_limits").eq("id", 1).single().execute().data
    _risk_limits_cache = row.get("risk_limits") or {}
    return _risk_limits_cache


def get_limit(investor_id, key):
    """투자자별 예외 반영 제한값 반환"""
    limits = load_risk_limits()
    exceptions = limits.get("exceptions", {})
    investor_exc = exceptions.get(investor_id, {})
    if key in investor_exc:
        return investor_exc[key]
    return limits.get(key)


def _build_sector_map():
    """stock_universe에서 ticker→sector 매핑 구성"""
    row = supabase.table("config").select("stock_universe").eq("id", 1).single().execute().data
    universe = row.get("stock_universe", [])
    return {s["ticker"]: s.get("sector", "") for s in universe}


def validate_allocation(investor_id, allocation):
    """포지션/섹터/현금 제한 검증 → (adjusted_allocation, violations) 반환

    violations: [{"type": "...", "detail": "..."}, ...]
    adjusted_allocation: 제한 초과 시 조정된 allocation (dict)
    """
    violations = []
    adjusted = dict(allocation)

    max_stock_pct = get_limit(investor_id, "max_single_stock_pct")
    max_sector_pct = get_limit(investor_id, "max_single_sector_pct")
    min_cash_pct = get_limit(investor_id, "min_cash_pct")

    # 1. 단일 종목 비중 제한
    if max_stock_pct is not None:
        max_ratio = max_stock_pct / 100.0
        for ticker, pct in list(adjusted.items()):
            if pct > max_ratio:
                violations.append({
                    "type": "단일종목초과",
                    "detail": f"{ticker} {pct*100:.1f}% → {max_stock_pct:.1f}%",
                })
                adjusted[ticker] = max_ratio

    # 2. 섹터 비중 제한
    if max_sector_pct is not None:
        sector_map = _build_sector_map()
        max_sector_ratio = max_sector_pct / 100.0

        # 섹터별 합계 계산
        sector_totals = {}
        for ticker, pct in adjusted.items():
            sector = sector_map.get(ticker, "기타")
            sector_totals[sector] = sector_totals.get(sector, 0) + pct

        for sector, total in sector_totals.items():
            if total > max_sector_ratio:
                # 섹터 내 종목을 비례 축소
                scale = max_sector_ratio / total
                for ticker, pct in list(adjusted.items()):
                    if sector_map.get(ticker, "기타") == sector:
                        adjusted[ticker] = round(pct * scale, 4)
                violations.append({
                    "type": "섹터초과",
                    "detail": f"{sector} {total*100:.1f}% → {max_sector_pct:.1f}%",
                })

    # 3. 최소 현금 비중 확보
    if min_cash_pct is not None:
        max_alloc_sum = 1.0 - min_cash_pct / 100.0
        alloc_sum = sum(adjusted.values())
        if alloc_sum > max_alloc_sum:
            scale = max_alloc_sum / alloc_sum
            adjusted = {t: round(p * scale, 4) for t, p in adjusted.items()}
            violations.append({
                "type": "현금부족",
                "detail": f"배분합계 {alloc_sum*100:.1f}% → {max_alloc_sum*100:.1f}%",
            })

    return adjusted, violations


def _check_daily_loss(date_str, today, prev):
    """전일 대비 일일 손실 체크"""
    events = []
    limits = load_risk_limits()
    threshold = limits.get("daily_loss_pct", -3.0)

    today_details = today.get("investor_details", {})
    prev_details = prev.get("investor_details", {})

    profiles = supabase.table("profiles").select("id, name").execute().data
    name_to_id = {p["name"]: p["id"] for p in profiles}

    for name, detail in today_details.items():
        prev_detail = prev_details.get(name)
        if not prev_detail:
            continue
        curr_asset = detail.get("total_asset", 0)
        prev_asset = prev_detail.get("total_asset", 0)
        if prev_asset <= 0:
            continue
        daily_change_pct = (curr_asset / prev_asset - 1) * 100
        if daily_change_pct <= threshold:
            inv_id = name_to_id.get(name, "?")
            events.append({
                "date": date_str,
                "investor_id": inv_id,
                "event_type": "daily_loss",
                "severity": "critical",
                "details": {
                    "change_pct": round(daily_change_pct, 2),
                    "threshold": threshold,
                    "prev_asset": prev_asset,
                    "curr_asset": curr_asset,
                },
                "action_taken": "alert_only",
            })
    return events


def _check_cumulative_loss(date_str, today):
    """시드 대비 누적 손실 체크"""
    events = []
    limits = load_risk_limits()
    threshold = limits.get("cumulative_loss_pct", -10.0)
    initial_capital = 5_000_000

    today_details = today.get("investor_details", {})
    profiles = supabase.table("profiles").select("id, name").execute().data
    name_to_id = {p["name"]: p["id"] for p in profiles}

    for name, detail in today_details.items():
        curr_asset = detail.get("total_asset", 0)
        cumulative_pct = (curr_asset / initial_capital - 1) * 100
        if cumulative_pct <= threshold:
            inv_id = name_to_id.get(name, "?")
            events.append({
                "date": date_str,
                "investor_id": inv_id,
                "event_type": "cumulative_loss",
                "severity": "critical",
                "details": {
                    "cumulative_pct": round(cumulative_pct, 2),
                    "threshold": threshold,
                    "curr_asset": curr_asset,
                    "initial_capital": initial_capital,
                },
                "action_taken": "flag_only",
            })
    return events


def _check_volatility_alerts(date_str, today):
    """개별 종목 급등락 → 보유 투자자 알림"""
    events = []
    limits = load_risk_limits()
    threshold = limits.get("stock_alert_change_pct", 10.0)

    market_prices = today.get("market_prices", {})
    today_details = today.get("investor_details", {})

    profiles = supabase.table("profiles").select("id, name").execute().data
    name_to_id = {p["name"]: p["id"] for p in profiles}

    # 급등락 종목 찾기
    volatile_tickers = {}
    for ticker, data in market_prices.items():
        change = abs(data.get("change_pct", 0))
        if change >= threshold:
            volatile_tickers[ticker] = data

    if not volatile_tickers:
        return events

    # 보유 투자자 확인
    for name, detail in today_details.items():
        holdings = detail.get("holdings", {})
        for ticker, stock_data in volatile_tickers.items():
            if ticker in holdings:
                inv_id = name_to_id.get(name, "?")
                events.append({
                    "date": date_str,
                    "investor_id": inv_id,
                    "event_type": "volatility_alert",
                    "severity": "warning",
                    "details": {
                        "ticker": ticker,
                        "name": stock_data.get("name", ticker),
                        "change_pct": stock_data.get("change_pct", 0),
                        "threshold": threshold,
                    },
                    "action_taken": "alert_only",
                })
    return events


def _check_strategy_health(date_str):
    """연속 손실 + MDD 체크 (최근 30일 snapshots)"""
    events = []
    limits = load_risk_limits()
    consec_threshold = limits.get("consecutive_loss_alert_days", 5)
    mdd_threshold = limits.get("mdd_alert_pct", -8.0)

    profiles = supabase.table("profiles").select("id, name").execute().data

    for profile in profiles:
        inv_id = profile["id"]
        name = profile["name"]

        # 최근 30일 스냅샷
        snapshots = (
            supabase.table("portfolio_snapshots")
            .select("date, total_asset")
            .eq("investor_id", inv_id)
            .lte("date", date_str)
            .order("date", desc=True)
            .limit(30)
            .execute()
            .data
        )
        if len(snapshots) < 2:
            continue

        # 시간순 정렬
        snapshots.sort(key=lambda s: s["date"])
        assets = [s["total_asset"] for s in snapshots]

        # 연속 손실 일수
        consecutive_loss = 0
        for i in range(len(assets) - 1, 0, -1):
            if assets[i] < assets[i - 1]:
                consecutive_loss += 1
            else:
                break

        if consecutive_loss >= consec_threshold:
            events.append({
                "date": date_str,
                "investor_id": inv_id,
                "event_type": "consecutive_loss",
                "severity": "warning",
                "details": {
                    "consecutive_days": consecutive_loss,
                    "threshold": consec_threshold,
                    "investor_name": name,
                },
                "action_taken": "alert_only",
            })

        # MDD 계산
        peak = assets[0]
        max_drawdown = 0
        for asset in assets:
            if asset > peak:
                peak = asset
            dd = (asset / peak - 1) * 100
            if dd < max_drawdown:
                max_drawdown = dd

        if max_drawdown <= mdd_threshold:
            events.append({
                "date": date_str,
                "investor_id": inv_id,
                "event_type": "mdd_alert",
                "severity": "critical",
                "details": {
                    "mdd_pct": round(max_drawdown, 2),
                    "threshold": mdd_threshold,
                    "investor_name": name,
                },
                "action_taken": "alert_only",
            })

    return events


def _save_risk_events(events):
    """리스크 이벤트 Supabase 저장"""
    if not events:
        return
    try:
        supabase.table("risk_events").insert(events).execute()
        logger.info(f"리스크 이벤트 {len(events)}건 저장")
    except Exception as e:
        logger.error(f"리스크 이벤트 저장 실패: {e}")


def _send_risk_alert(date_str, events):
    """리스크 이벤트 텔레그램 발송"""
    if not events:
        return

    severity_emoji = {"critical": "\U0001f534", "warning": "\U0001f7e1"}
    type_label = {
        "daily_loss": "일일 손실",
        "cumulative_loss": "누적 손실",
        "volatility_alert": "종목 급변",
        "consecutive_loss": "연속 손실",
        "mdd_alert": "MDD",
    }

    lines = [f"\U0001f6a8 *리스크 알림* ({date_str})"]
    for ev in events:
        emoji = severity_emoji.get(ev["severity"], "\u26aa")
        label = type_label.get(ev["event_type"], ev["event_type"])
        details = ev["details"]

        if ev["event_type"] == "daily_loss":
            msg = f"{details.get('investor_name', ev['investor_id'])} {details['change_pct']}% (한도: {details['threshold']}%)"
        elif ev["event_type"] == "cumulative_loss":
            msg = f"{details.get('investor_name', ev['investor_id'])} 누적 {details['cumulative_pct']}% (한도: {details['threshold']}%)"
        elif ev["event_type"] == "volatility_alert":
            msg = f"{details['name']} {details['change_pct']:+.1f}% (투자자: {ev['investor_id']})"
        elif ev["event_type"] == "consecutive_loss":
            msg = f"{details['investor_name']} {details['consecutive_days']}일 연속 하락"
        elif ev["event_type"] == "mdd_alert":
            msg = f"{details['investor_name']} {details['mdd_pct']}% (한도: {details['threshold']}%)"
        else:
            msg = str(details)

        lines.append(f"{emoji} [{label}] {msg}")

    message = "\n".join(lines)
    try:
        send_telegram(message)
        logger.info(f"리스크 알림 텔레그램 발송 완료 ({len(events)}건)")
    except Exception as e:
        logger.error(f"리스크 알림 텔레그램 발송 실패: {e}")


def check_risk_limits(date_str):
    """통합 리스크 체크: 4개 체크 → risk_events 저장 → 텔레그램"""
    # 오늘 + 전일 리포트 로드
    result = (
        supabase.table("daily_reports")
        .select("date, rankings, investor_details, market_prices")
        .order("date", desc=True)
        .limit(2)
        .execute()
    )
    reports = result.data or []

    today = None
    prev = None
    for r in reports:
        if r["date"] == date_str:
            today = r
        elif today is not None:
            prev = r

    if not today:
        logger.warning(f"{date_str} daily_reports 없음, 리스크 체크 스킵")
        return []

    # 이름→ID 매핑을 details에 추가하기 위해 프로필 로드
    profiles = supabase.table("profiles").select("id, name").execute().data
    name_to_id = {p["name"]: p["id"] for p in profiles}
    id_to_name = {p["id"]: p["name"] for p in profiles}

    all_events = []

    # 1. 일일 손실 체크
    if prev:
        daily_events = _check_daily_loss(date_str, today, prev)
        for ev in daily_events:
            ev["details"]["investor_name"] = id_to_name.get(ev["investor_id"], ev["investor_id"])
        all_events.extend(daily_events)

    # 2. 누적 손실 체크
    cumulative_events = _check_cumulative_loss(date_str, today)
    for ev in cumulative_events:
        ev["details"]["investor_name"] = id_to_name.get(ev["investor_id"], ev["investor_id"])
    all_events.extend(cumulative_events)

    # 3. 변동성 알림
    vol_events = _check_volatility_alerts(date_str, today)
    for ev in vol_events:
        ev["details"]["investor_name"] = id_to_name.get(ev["investor_id"], ev["investor_id"])
    all_events.extend(vol_events)

    # 4. 전략 건강도
    health_events = _check_strategy_health(date_str)
    all_events.extend(health_events)

    if all_events:
        _save_risk_events(all_events)
        _send_risk_alert(date_str, all_events)
        logger.info(f"리스크 이벤트 {len(all_events)}건 감지")
    else:
        logger.info(f"{date_str} 리스크 이벤트 없음")

    return all_events


if __name__ == "__main__":
    date = sys.argv[1] if len(sys.argv) > 1 else datetime.now().strftime("%Y-%m-%d")
    events = check_risk_limits(date)
    for e in events:
        print(f"[{e['severity']}] {e['event_type']}: {e['details']}")
