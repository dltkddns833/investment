"""분기 성과 리포트 — 분기 첫 영업일에 지난 분기 성과를 텔레그램으로 발송 & Supabase 저장"""
import sys
from datetime import datetime, timedelta
from pathlib import Path

import holidays
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

SCRIPTS_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS_DIR / "core"))
sys.path.insert(0, str(SCRIPTS_DIR / "notifications"))
from supabase_client import supabase
from send_telegram import send_telegram

KR_HOLIDAYS = holidays.KR()

QUARTER_START_MONTHS = {1, 4, 7, 10}


def is_business_day(d):
    return d.weekday() < 5 and d not in KR_HOLIDAYS


def is_first_business_day_of_quarter(today):
    """분기 첫 영업일인지 확인"""
    if today.month not in QUARTER_START_MONTHS:
        return False
    first = today.replace(day=1)
    for i in range(today.day):
        candidate = first + timedelta(days=i)
        if is_business_day(candidate):
            return candidate == today
    return False


def get_last_quarter_range(today):
    """지난 분기 시작일~종료일 반환"""
    q_start_month = today.month  # 현재 분기 시작월
    # 지난 분기 시작월
    prev_q_start = q_start_month - 3
    prev_q_year = today.year
    if prev_q_start <= 0:
        prev_q_start += 12
        prev_q_year -= 1

    from calendar import monthrange
    first_day = datetime(prev_q_year, prev_q_start, 1).date()
    # 지난 분기 마지막 달
    last_month = prev_q_start + 2
    last_year = prev_q_year
    if last_month > 12:
        last_month -= 12
        last_year += 1
    _, last_day_num = monthrange(last_year, last_month)
    last_day = datetime(last_year, last_month, last_day_num).date()

    return first_day, last_day


def get_quarter_label(d):
    """날짜에서 분기 라벨 생성 (예: 2026-Q1)"""
    q = (d.month - 1) // 3 + 1
    return f"{d.year}-Q{q}"


def build_quarterly_report(today):
    """지난 분기 daily_reports로 분기 리포트 생성"""
    first_day, last_day = get_last_quarter_range(today)

    result = (
        supabase.table("daily_reports")
        .select("date, rankings, investor_details")
        .gte("date", first_day.strftime("%Y-%m-%d"))
        .lte("date", last_day.strftime("%Y-%m-%d"))
        .order("date")
        .execute()
    )

    reports = result.data
    if not reports:
        return None, None

    first_report = reports[0]
    last_report = reports[-1]
    first_details = first_report.get("investor_details", {})
    last_details = last_report.get("investor_details", {})

    # 분기 수익률 계산
    quarterly_results = []
    for name, detail in last_details.items():
        end_asset = detail.get("total_asset", 5_000_000)
        start_asset = first_details.get(name, {}).get("total_asset", 5_000_000)
        period_return = ((end_asset - start_asset) / start_asset * 100) if start_asset > 0 else 0
        quarterly_results.append({
            "investor": name,
            "total_asset": end_asset,
            "total_return_pct": detail.get("total_return_pct", 0),
            "period_return_pct": round(period_return, 2),
        })

    quarterly_results.sort(key=lambda x: x["period_return_pct"], reverse=True)
    for i, r in enumerate(quarterly_results):
        r["rank"] = i + 1

    mvp = quarterly_results[0] if quarterly_results else None
    worst = quarterly_results[-1] if quarterly_results else None

    q_label = get_quarter_label(first_day)
    period = f"{first_day.strftime('%m/%d')}~{last_day.strftime('%m/%d')}"
    lines = [f"*📊 분기 성과 리포트* ({q_label})", f"기간: {period} / 거래일수: {len(reports)}일", ""]

    lines.append("*🏆 분기 수익률 순위*")
    for r in quarterly_results:
        medal = ["🥇", "🥈", "🥉"][r["rank"] - 1] if r["rank"] <= 3 else f"{r['rank']}."
        lines.append(f"{medal} {r['investor']}: {r['period_return_pct']:+.2f}%")

    lines.append("")
    lines.append("*📈 분기말 총자산*")
    for r in quarterly_results:
        total_ret = r["total_return_pct"]
        lines.append(f"  {r['investor']}: {r['total_asset']:,.0f}원 (누적 {total_ret:+.2f}%)")

    lines.append("")
    lines.append(f"_생성: {today.strftime('%Y-%m-%d %H:%M')}_")

    text = "\n".join(lines)

    # Supabase 저장
    db_data = {
        "period_type": "quarterly",
        "period_start": first_day.strftime("%Y-%m-%d"),
        "period_end": last_day.strftime("%Y-%m-%d"),
        "period_label": q_label,
        "generated_at": datetime.now().isoformat(),
        "trading_days": len(reports),
        "rankings": quarterly_results,
        "highlights": {"mvp": mvp, "worst": worst} if mvp else None,
        "summary": text,
    }
    supabase.table("periodic_reports").upsert(db_data).execute()

    return text, q_label


def main():
    if len(sys.argv) > 1:
        today = datetime.strptime(sys.argv[1], "%Y-%m-%d").date()
    else:
        today = datetime.now().date()

    if not is_first_business_day_of_quarter(today):
        print(f"{today} — 분기 첫 영업일이 아님, 스킵")
        return

    print(f"{today} — 분기 첫 영업일! 분기 리포트 생성 중...")

    report_text, label = build_quarterly_report(datetime.combine(today, datetime.min.time()))
    if report_text is None:
        print("지난 분기 daily_reports 데이터 없음, 스킵")
        return

    print(report_text)
    send_telegram(report_text)
    print(f"분기 리포트({label}) 텔레그램 발송 완료")


if __name__ == "__main__":
    main()
