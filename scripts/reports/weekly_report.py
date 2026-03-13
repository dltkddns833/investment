"""주간 성과 리포트 — 첫 영업일에만 지난주 성과를 텔레그램으로 발송"""
import sys
from datetime import datetime, timedelta
from pathlib import Path

import holidays
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

# 프로젝트 내부 모듈
SCRIPTS_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS_DIR / "core"))
sys.path.insert(0, str(SCRIPTS_DIR / "notifications"))
from supabase_client import supabase
from send_telegram import send_telegram

KR_HOLIDAYS = holidays.KR()


def is_business_day(d):
    """영업일(평일 + 공휴일 아님) 여부"""
    return d.weekday() < 5 and d not in KR_HOLIDAYS


def is_first_business_day_of_week(today):
    """이번 주(월~일) 첫 영업일인지 확인"""
    monday = today - timedelta(days=today.weekday())
    for i in range(today.weekday() + 1):
        candidate = monday + timedelta(days=i)
        if is_business_day(candidate):
            return candidate == today
    return False


def get_last_week_range(today):
    """지난주 월~금 날짜 범위 반환"""
    monday = today - timedelta(days=today.weekday())
    last_monday = monday - timedelta(days=7)
    last_friday = last_monday + timedelta(days=4)
    return last_monday, last_friday


def build_weekly_report(today):
    """지난주 daily_reports 데이터로 주간 리포트 생성"""
    last_monday, last_friday = get_last_week_range(today)

    # 지난주 리포트 조회
    result = (
        supabase.table("daily_reports")
        .select("date, rankings, investor_details")
        .gte("date", last_monday.strftime("%Y-%m-%d"))
        .lte("date", last_friday.strftime("%Y-%m-%d"))
        .order("date")
        .execute()
    )

    reports = result.data
    if not reports:
        return None

    # 마지막 날 기준 순위
    latest = reports[-1]
    rankings = latest.get("rankings", [])
    investor_details = latest.get("investor_details", {})

    # 주 시작/끝 자산 비교 (첫날 vs 마지막날)
    first_report = reports[0]
    first_details = first_report.get("investor_details", {})

    period = f"{last_monday.strftime('%m/%d')}~{last_friday.strftime('%m/%d')}"
    lines = [f"*📊 주간 성과 리포트* ({period})", f"거래일수: {len(reports)}일", ""]

    # 순위표
    lines.append("*🏆 주간 종료 순위*")
    for i, r in enumerate(rankings):
        name = r.get("investor", "")
        total = r.get("total_asset", 0)
        ret = r.get("total_return_pct", 0)
        medal = ["🥇", "🥈", "🥉"][i] if i < 3 else f"{i+1}."
        lines.append(f"{medal} {name}: {total:,.0f}원 ({ret:+.2f}%)")

    # 주간 변동 (마지막날 - 첫날)
    lines.append("")
    lines.append("*📈 주간 변동*")
    for r in rankings:
        name = r.get("investor", "")
        end_total = r.get("total_asset", 0)

        start_total = 5_000_000  # 기본값
        if name in first_details:
            start_total = first_details[name].get("total_asset", 5_000_000)

        weekly_change = end_total - start_total
        arrow = "▲" if weekly_change >= 0 else "▼"
        lines.append(f"  {name}: {arrow} {abs(weekly_change):,.0f}원")

    lines.append("")
    lines.append(f"_생성: {today.strftime('%Y-%m-%d %H:%M')}_")

    return "\n".join(lines)


def main():
    if len(sys.argv) > 1:
        today = datetime.strptime(sys.argv[1], "%Y-%m-%d").date()
    else:
        today = datetime.now().date()

    if not is_first_business_day_of_week(today):
        print(f"{today} — 이번 주 첫 영업일이 아님, 스킵")
        return

    print(f"{today} — 이번 주 첫 영업일! 주간 리포트 생성 중...")

    report = build_weekly_report(datetime.combine(today, datetime.min.time()))
    if report is None:
        print("지난주 daily_reports 데이터 없음, 스킵")
        return

    print(report)
    send_telegram(report)
    print("주간 리포트 텔레그램 발송 완료")


if __name__ == "__main__":
    main()
