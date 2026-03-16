"""월간 성과 리포트 — 월 첫 영업일에 지난달 성과를 텔레그램으로 발송 & Supabase 저장"""
import sys
from datetime import datetime, timedelta
from pathlib import Path
from calendar import monthrange

import holidays
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

SCRIPTS_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS_DIR / "core"))
sys.path.insert(0, str(SCRIPTS_DIR / "notifications"))
from supabase_client import supabase
from send_telegram import send_telegram

KR_HOLIDAYS = holidays.KR()


def is_business_day(d):
    return d.weekday() < 5 and d not in KR_HOLIDAYS


def is_first_business_day_of_month(today):
    """이번 달 첫 영업일인지 확인"""
    first = today.replace(day=1)
    for i in range(today.day):
        candidate = first + timedelta(days=i)
        if is_business_day(candidate):
            return candidate == today
    return False


def get_last_month_range(today):
    """지난달 1일~말일 반환"""
    first_this_month = today.replace(day=1)
    last_day_prev = first_this_month - timedelta(days=1)
    first_day_prev = last_day_prev.replace(day=1)
    return first_day_prev, last_day_prev


def build_monthly_report(today):
    """지난달 daily_reports로 월간 리포트 생성"""
    first_day, last_day = get_last_month_range(today)

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

    # 월간 수익률 계산
    monthly_results = []
    for name, detail in last_details.items():
        end_asset = detail.get("total_asset", 5_000_000)
        start_asset = first_details.get(name, {}).get("total_asset", 5_000_000)
        period_return = ((end_asset - start_asset) / start_asset * 100) if start_asset > 0 else 0
        monthly_results.append({
            "investor": name,
            "total_asset": end_asset,
            "total_return_pct": detail.get("total_return_pct", 0),
            "period_return_pct": round(period_return, 2),
        })

    monthly_results.sort(key=lambda x: x["period_return_pct"], reverse=True)

    # 순위 추가
    for i, r in enumerate(monthly_results):
        r["rank"] = i + 1

    mvp = monthly_results[0] if monthly_results else None
    worst = monthly_results[-1] if monthly_results else None

    month_str = f"{last_day.year}년 {last_day.month}월"
    period = f"{first_day.strftime('%m/%d')}~{last_day.strftime('%m/%d')}"
    lines = [f"*📊 월간 성과 리포트* ({month_str})", f"기간: {period} / 거래일수: {len(reports)}일", ""]

    lines.append("*🏆 월간 수익률 순위*")
    for r in monthly_results:
        medal = ["🥇", "🥈", "🥉"][r["rank"] - 1] if r["rank"] <= 3 else f"{r['rank']}."
        lines.append(f"{medal} {r['investor']}: {r['period_return_pct']:+.2f}%")

    lines.append("")
    lines.append("*📈 월말 총자산*")
    for r in monthly_results:
        total_ret = r["total_return_pct"]
        lines.append(f"  {r['investor']}: {r['total_asset']:,.0f}원 (누적 {total_ret:+.2f}%)")

    lines.append("")
    lines.append(f"_생성: {today.strftime('%Y-%m-%d %H:%M')}_")

    text = "\n".join(lines)

    # Supabase 저장
    period_label = last_day.strftime("%Y-%m")
    db_data = {
        "period_type": "monthly",
        "period_start": first_day.strftime("%Y-%m-%d"),
        "period_end": last_day.strftime("%Y-%m-%d"),
        "period_label": period_label,
        "generated_at": datetime.now().isoformat(),
        "trading_days": len(reports),
        "rankings": monthly_results,
        "highlights": {"mvp": mvp, "worst": worst} if mvp else None,
        "summary": text,
    }
    supabase.table("periodic_reports").upsert(db_data).execute()

    return text, period_label


def main():
    if len(sys.argv) > 1:
        today = datetime.strptime(sys.argv[1], "%Y-%m-%d").date()
    else:
        today = datetime.now().date()

    if not is_first_business_day_of_month(today):
        print(f"{today} — 이번 달 첫 영업일이 아님, 스킵")
        return

    print(f"{today} — 이번 달 첫 영업일! 월간 리포트 생성 중...")

    report_text, label = build_monthly_report(datetime.combine(today, datetime.min.time()))
    if report_text is None:
        print("지난달 daily_reports 데이터 없음, 스킵")
        return

    print(report_text)
    send_telegram(report_text)
    print(f"월간 리포트({label}) 텔레그램 발송 완료")


if __name__ == "__main__":
    main()
