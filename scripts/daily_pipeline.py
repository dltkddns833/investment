"""일일 시뮬레이션 파이프라인 헬퍼"""
import json
import sys
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
NEWS_DIR = BASE_DIR / "news"
ALLOCATIONS_DIR = BASE_DIR / "investors" / "allocations"
PROFILES_DIR = BASE_DIR / "investors" / "profiles"


def save_news(date_str, articles):
    """뉴스 기사 저장

    Args:
        date_str: "2026-03-10" 형식
        articles: [{"title": ..., "summary": ..., "category": ..., "source": ...}, ...]
    """
    NEWS_DIR.mkdir(parents=True, exist_ok=True)

    path = NEWS_DIR / f"{date_str}.json"
    data = {
        "date": date_str,
        "collected_at": datetime.now().isoformat(),
        "count": len(articles),
        "articles": articles,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"뉴스 {len(articles)}건 저장 완료: {path}")
    return path


def save_allocation(investor_id, date_str, allocation, rationale=""):
    """투자자별 배분 결정 저장

    Args:
        investor_id: "A", "B", "C"
        date_str: "2026-03-10" 형식
        allocation: {"005930.KS": 0.25, ...} (합계 = 1.0)
        rationale: 배분 근거 설명
    """
    alloc_dir = ALLOCATIONS_DIR / investor_id
    alloc_dir.mkdir(parents=True, exist_ok=True)

    # 프로필 로드
    profile_path = PROFILES_DIR / f"{investor_id}.json"
    with open(profile_path, "r", encoding="utf-8") as f:
        profile = json.load(f)

    total = sum(allocation.values())
    data = {
        "date": date_str,
        "investor": profile["name"],
        "strategy": profile["strategy"],
        "rationale": rationale,
        "allocation": allocation,
        "allocation_sum": round(total, 4),
        "num_stocks": len([v for v in allocation.values() if v > 0]),
        "generated_at": datetime.now().isoformat(),
    }

    path = alloc_dir / f"{date_str}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"{profile['name']} 배분 저장 완료: {path}")
    return path


def check_pipeline_status(date_str):
    """파이프라인 진행 상태 확인"""
    status = {
        "date": date_str,
        "news_collected": (NEWS_DIR / f"{date_str}.json").exists(),
        "allocations": {},
        "report_generated": (BASE_DIR / "report" / "daily" / f"{date_str}.json").exists(),
    }

    for inv_id in ["A", "B", "C"]:
        status["allocations"][inv_id] = (ALLOCATIONS_DIR / inv_id / f"{date_str}.json").exists()

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
    print()
    return s


if __name__ == "__main__":
    date_str = sys.argv[1] if len(sys.argv) > 1 else datetime.now().strftime("%Y-%m-%d")
    print_status(date_str)
