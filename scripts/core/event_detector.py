"""이벤트 감지 & 텔레그램 알림 — 시뮬레이션 후 자동 호출"""
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "notifications"))

from supabase_client import supabase
from send_telegram import send_telegram
from logger import get_logger

logger = get_logger(__name__)


def _load_reports(date_str):
    """오늘 리포트 + 전체 히스토리 로드"""
    result = (
        supabase.table("daily_reports")
        .select("date, rankings, investor_details")
        .order("date")
        .execute()
    )
    all_reports = result.data or []

    today = None
    prev = None
    for i, r in enumerate(all_reports):
        if r["date"] == date_str:
            today = r
            if i > 0:
                prev = all_reports[i - 1]
            break

    return today, prev, all_reports


def _detect_streak_events(today, all_reports):
    """연속 1위 마일스톤 감지 (3, 5, 7, 10일)"""
    events = []
    today_date = today["date"]

    # 오늘까지의 리포트만 사용
    reports_until_today = [r for r in all_reports if r["date"] <= today_date]

    # 현재 연속 1위 추적
    streaks = {}
    for report in reports_until_today:
        rank1 = None
        for r in report["rankings"]:
            if r["rank"] == 1:
                rank1 = r["investor"]
                break
        if rank1:
            for name in list(streaks.keys()):
                if name != rank1:
                    streaks[name] = 0
            streaks[rank1] = streaks.get(rank1, 0) + 1

    # 오늘 1위인 투자자의 연속 기록 확인
    today_rank1 = None
    for r in today["rankings"]:
        if r["rank"] == 1:
            today_rank1 = r["investor"]
            break

    if today_rank1 and today_rank1 in streaks:
        streak = streaks[today_rank1]
        milestones = [10, 7, 5, 3]
        for m in milestones:
            if streak == m:
                events.append(f"🔥 {today_rank1} {m}일 연속 1위!")
                break

    return events


def _detect_rank_change_events(today, prev):
    """전일 대비 3순위 이상 변동 감지"""
    events = []
    if not prev:
        return events

    prev_ranks = {r["investor"]: r["rank"] for r in prev["rankings"]}

    for r in today["rankings"]:
        name = r["investor"]
        curr_rank = r["rank"]
        prev_rank = prev_ranks.get(name)
        if prev_rank is None:
            continue

        diff = prev_rank - curr_rank  # 양수면 상승
        if diff >= 3:
            events.append(f"📈 {name} {prev_rank}위→{curr_rank}위 급등!")
        elif diff <= -3:
            events.append(f"📉 {name} {prev_rank}위→{curr_rank}위 하락")

    return events


def _detect_asset_milestone_events(today, prev):
    """자산 마일스톤 돌파 + 손실 전환 감지"""
    events = []
    if not prev:
        return events

    milestones = [5_500_000, 6_000_000, 6_500_000, 7_000_000, 7_500_000, 8_000_000]
    today_details = today.get("investor_details", {})
    prev_details = prev.get("investor_details", {})

    for name, detail in today_details.items():
        prev_detail = prev_details.get(name)
        if not prev_detail:
            continue

        curr_asset = detail.get("total_asset", 0)
        prev_asset = prev_detail.get("total_asset", 0)

        # 자산 마일스톤 돌파
        for m in milestones:
            if curr_asset >= m > prev_asset:
                events.append(f"🎯 {name} 총자산 {m // 10000}만원 돌파!")
                break  # 하루에 하나의 마일스톤만

        # 손실 전환 (양→음)
        curr_return = detail.get("total_return_pct", 0)
        prev_return = prev_detail.get("total_return_pct", 0)
        if prev_return >= 0 and curr_return < 0:
            events.append(f"⚠️ {name} 손실 전환 (총자산 {curr_asset:,.0f}원)")

    return events


def _detect_close_race_events(today):
    """인접 순위 투자자 간 초접전 감지 (수익률 차이 ≤ 0.1%)"""
    events = []
    rankings = sorted(today["rankings"], key=lambda r: r["rank"])

    for i in range(len(rankings) - 1):
        a = rankings[i]
        b = rankings[i + 1]
        diff = abs(a.get("total_return_pct", 0) - b.get("total_return_pct", 0))
        if diff <= 0.1:
            events.append(
                f"⚡ {a['investor']}와 {b['investor']}의 수익률 차이 {diff:.2f}% (초접전!)"
            )

    # 너무 많으면 상위 2개만
    return events[:2]


def _detect_first_time_events(today, all_reports):
    """처음으로 1위/꼴찌 달성 감지"""
    events = []
    today_date = today["date"]
    total_investors = len(today["rankings"])

    # 오늘 이전까지의 히스토리
    history = [r for r in all_reports if r["date"] < today_date]

    # 과거에 1위/꼴찌였던 투자자 집합
    ever_rank1 = set()
    ever_last = set()
    for r in history:
        for entry in r["rankings"]:
            if entry["rank"] == 1:
                ever_rank1.add(entry["investor"])
            if entry["rank"] == total_investors:
                ever_last.add(entry["investor"])

    # 오늘 1위가 처음인지
    for r in today["rankings"]:
        if r["rank"] == 1 and r["investor"] not in ever_rank1:
            events.append(f"👑 {r['investor']} 처음으로 1위 등극!")
        if r["rank"] == total_investors and r["investor"] not in ever_last:
            events.append(f"😱 {r['investor']} 처음으로 꼴찌")

    return events


def detect_events(date_str=None):
    """이벤트 감지 (텔레그램 발송 안함, 테스트용)"""
    if date_str is None:
        date_str = datetime.now().strftime("%Y-%m-%d")

    today, prev, all_reports = _load_reports(date_str)
    if not today:
        logger.warning(f"{date_str} daily_reports 없음, 이벤트 감지 스킵")
        return []

    events = []
    events.extend(_detect_streak_events(today, all_reports))
    events.extend(_detect_rank_change_events(today, prev))
    events.extend(_detect_asset_milestone_events(today, prev))
    events.extend(_detect_close_race_events(today))
    events.extend(_detect_first_time_events(today, all_reports))

    return events


def detect_and_alert(date_str=None):
    """이벤트 감지 + 텔레그램 발송"""
    if date_str is None:
        date_str = datetime.now().strftime("%Y-%m-%d")

    events = detect_events(date_str)

    if events:
        message = f"*🚨 오늘의 이벤트* ({date_str})\n\n" + "\n".join(events)
        try:
            send_telegram(message)
            logger.info(f"이벤트 {len(events)}건 텔레그램 발송 완료")
        except Exception as e:
            logger.error(f"텔레그램 발송 실패: {e}")
    else:
        logger.info(f"{date_str} 감지된 이벤트 없음")

    return events


if __name__ == "__main__":
    date = sys.argv[1] if len(sys.argv) > 1 else None
    events = detect_and_alert(date)
    for e in events:
        print(e)
