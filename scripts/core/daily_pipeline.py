"""일일 시뮬레이션 파이프라인 헬퍼"""
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "notifications"))

from supabase_client import supabase
from send_telegram import send_telegram
from logger import get_logger

logger = get_logger(__name__)


def notify(message):
    """파이프라인 진행 상황 텔레그램 알림"""
    try:
        send_telegram(message)
    except Exception as e:
        logger.warning(f"텔레그램 알림 실패 (무시): {e}")


def save_news(date_str, articles):
    """뉴스 기사 저장 (Supabase)

    Args:
        date_str: "2026-03-10" 형식
        articles: [{"title": ..., "summary": ..., "category": ..., "source": ..., "url": ...}, ...]
    """
    data = {
        "date": date_str,
        "collected_at": datetime.now().isoformat(),
        "count": len(articles),
        "articles": articles,
    }
    try:
        supabase.table("news").upsert(data).execute()
    except Exception as e:
        logger.error(f"뉴스 저장 실패: {e}")
        raise

    logger.info(f"뉴스 {len(articles)}건 저장 완료: news/{date_str}")
    return data


def save_allocation(investor_id, date_str, allocation, rationale="", sentiment_scores=None):
    """투자자별 배분 결정 저장 (Supabase)

    Args:
        investor_id: "A", "B", "C"
        date_str: "2026-03-10" 형식
        allocation: {"005930.KS": 0.25, ...} (합계 ≤ 1.0, M 오판단은 현금비중만큼 합계 < 1.0)
        rationale: 배분 근거 설명
        sentiment_scores: G 문여론 전용. {"005930.KS": {"score": 0.6, "label": "긍정", "reason": "..."}, ...}
    """
    # 리스크 제한 검증
    try:
        from risk_manager import validate_allocation
        adjusted, violations = validate_allocation(investor_id, allocation)
        if violations:
            violation_text = "; ".join(v["type"] for v in violations)
            rationale += f"\n[리스크 조정] {violation_text}"
            allocation = adjusted
    except Exception as e:
        logger.warning(f"리스크 검증 실패 (원본 유지): {e}")

    # 프로필 로드
    profile = supabase.table("profiles").select("name, strategy").eq("id", investor_id).single().execute().data

    total = sum(allocation.values())
    data = {
        "investor_id": investor_id,
        "date": date_str,
        "investor": profile["name"],
        "strategy": profile["strategy"],
        "rationale": rationale,
        "allocation": allocation,
        "allocation_sum": round(total, 4),
        "num_stocks": len([v for v in allocation.values() if v > 0]),
        "generated_at": datetime.now().isoformat(),
    }
    if sentiment_scores is not None:
        data["sentiment_scores"] = sentiment_scores

    try:
        supabase.table("allocations").upsert(data).execute()
    except Exception as e:
        logger.error(f"{profile['name']} 배분 저장 실패: {e}")
        raise

    logger.info(f"{profile['name']} 배분 저장 완료: allocations/{investor_id}/{date_str}")
    return data


def save_stories(date_str, commentary, diaries):
    """데일리 코멘터리 & 투자자 일기 저장 (Supabase)"""
    data = {
        "date": date_str,
        "generated_at": datetime.now().isoformat(),
        "commentary": commentary,
        "diaries": diaries,
    }
    try:
        supabase.table("daily_stories").upsert(data).execute()
    except Exception as e:
        logger.error(f"데일리 스토리 저장 실패: {e}")
        raise

    logger.info(f"데일리 스토리 저장 완료: daily_stories/{date_str}")
    return data


def save_snapshots(date_str, snapshot_rows):
    """포트폴리오 스냅샷 일괄 저장 (Supabase)

    Args:
        date_str: "2026-03-10" 형식
        snapshot_rows: [{"investor_id": "A", "holdings": {...}, "cash": ..., "total_asset": ...}, ...]
    """
    data = [
        {
            "investor_id": row["investor_id"],
            "date": date_str,
            "holdings": row["holdings"],
            "cash": row["cash"],
            "total_asset": row["total_asset"],
            "snapshot_at": datetime.now().isoformat(),
        }
        for row in snapshot_rows
    ]
    try:
        supabase.table("portfolio_snapshots").upsert(data).execute()
    except Exception as e:
        logger.error(f"포트폴리오 스냅샷 저장 실패: {e}")
        raise

    logger.info(f"포트폴리오 스냅샷 {len(data)}건 저장 완료: portfolio_snapshots/{date_str}")


def check_pipeline_status(date_str):
    """파이프라인 진행 상태 확인 (Supabase)"""
    news_result = supabase.table("news").select("date").eq("date", date_str).execute()
    report_result = supabase.table("daily_reports").select("date").eq("date", date_str).execute()
    stories_result = supabase.table("daily_stories").select("date").eq("date", date_str).execute()

    status = {
        "date": date_str,
        "news_collected": len(news_result.data) > 0,
        "allocations": {},
        "report_generated": len(report_result.data) > 0,
        "stories_generated": len(stories_result.data) > 0,
    }

    investor_rows = supabase.table("profiles").select("id").execute().data
    all_investor_ids = sorted([r["id"] for r in investor_rows])
    for inv_id in all_investor_ids:
        alloc_result = supabase.table("allocations").select("investor_id").eq("investor_id", inv_id).eq("date", date_str).execute()
        status["allocations"][inv_id] = len(alloc_result.data) > 0

    return status


def print_status(date_str):
    """파이프라인 상태 출력"""
    s = check_pipeline_status(date_str)
    ok = lambda v: "O" if v else "X"

    print(f"\n 파이프라인 상태: {date_str}")
    print(f"  [1] 뉴스 수집:    {ok(s['news_collected'])}")
    print(f"  [2] 배분 결정:")
    for inv_id, done in s["allocations"].items():
        print(f"       투자자 {inv_id}: {ok(done)}")
    print(f"  [3] 시뮬레이션:   {ok(s['report_generated'])}")
    print(f"  [4] 스토리텔링:   {ok(s['stories_generated'])}")
    print()
    return s


if __name__ == "__main__":
    date_str = sys.argv[1] if len(sys.argv) > 1 else datetime.now().strftime("%Y-%m-%d")
    print_status(date_str)
