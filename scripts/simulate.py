"""일일 시뮬레이션 오케스트레이터"""
import json
import sys
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "scripts"))

from market import get_stock_prices
from portfolio import (
    get_all_investors,
    is_rebalance_due,
    load_portfolio,
    load_profile,
    rebalance,
    evaluate,
)


ALLOCATIONS_DIR = BASE_DIR / "investors" / "allocations"


def load_investor_allocation(investor_id, date_str):
    """투자자별 개별 배분 로드: investors/allocations/{id}/{date}.json"""
    path = ALLOCATIONS_DIR / investor_id / f"{date_str}.json"
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def run_simulation(date_str=None):
    """일일 시뮬레이션 실행"""
    if date_str is None:
        date_str = datetime.now().strftime("%Y-%m-%d")

    print(f"\n{'='*60}")
    print(f" 시뮬레이션 실행: {date_str}")
    print(f"{'='*60}")

    # 1. 현재 주가 조회
    print(f"\n [주가 조회 중...]")
    current_prices = get_stock_prices()
    if not current_prices:
        print("[오류] 주가 조회 실패")
        return None
    for ticker, data in current_prices.items():
        print(f"  {data['name']}: {data['price']:,}원 ({'+' if data['change_pct'] >= 0 else ''}{data['change_pct']:.2f}%)")

    # 2. 각 투자자별 리밸런싱
    investors = get_all_investors()
    rebalance_results = {}

    print(f"\n [리밸런싱 체크]")
    for inv_id in sorted(investors):
        profile = load_profile(inv_id)
        due = is_rebalance_due(inv_id, date_str)
        freq = profile["rebalance_frequency_days"]

        if not due:
            print(f"  {profile['name']} ({profile['strategy']}, 빈도: {freq}일) → 스킵")
            rebalance_results[inv_id] = {"rebalanced": False, "trades": []}
            continue

        # 투자자별 개별 allocation 로드
        alloc_data = load_investor_allocation(inv_id, date_str)
        if alloc_data is None:
            print(f"  {profile['name']} ({profile['strategy']}, 빈도: {freq}일) → 배분 없음 (스킵)")
            rebalance_results[inv_id] = {"rebalanced": False, "trades": []}
            continue

        allocation = alloc_data["allocation"]
        print(f"  {profile['name']} ({profile['strategy']}, 빈도: {freq}일) → 실행")
        for ticker, pct in allocation.items():
            print(f"    목표: {ticker} {pct*100:.1f}%")

        trades = rebalance(inv_id, allocation, current_prices, date_str)
        if trades:
            for t in trades:
                print(f"    {t['type'].upper()} {t['ticker']} {t['shares']}주 @ {t['price']:,}원")
        else:
            print(f"    변경 없음 (이미 목표 배분과 일치)")

        rebalance_results[inv_id] = {"rebalanced": True, "trades": trades}

    # 3. 포트폴리오 평가
    print(f"\n [포트폴리오 평가]")
    for inv_id in sorted(investors):
        profile = load_profile(inv_id)
        portfolio = load_portfolio(inv_id)
        result = evaluate(inv_id, current_prices)
        sign = "+" if result["total_return"] >= 0 else ""
        print(f"  {result['investor']} ({profile['strategy']}): 총자산 {result['total_asset']:,}원 ({sign}{result['total_return_pct']:.2f}%)")

    # 4. 일간 리포트 생성
    report = generate_daily_report_with_rebalance(current_prices, date_str, rebalance_results)

    print(f"\n 리포트 저장 완료: report/daily/{date_str}.json")
    print(f"{'='*60}\n")

    return report


def generate_daily_report_with_rebalance(current_prices, date_str, rebalance_results):
    """리밸런싱 정보가 포함된 일간 리포트 생성"""
    investors = get_all_investors()
    results = []

    for inv_id in investors:
        result = evaluate(inv_id, current_prices)
        profile = load_profile(inv_id)
        portfolio = load_portfolio(inv_id)

        result["rebalance_frequency_days"] = profile["rebalance_frequency_days"]
        result["rebalanced_today"] = rebalance_results.get(inv_id, {}).get("rebalanced", False)
        result["total_rebalances"] = len(portfolio.get("rebalance_history", []))
        result["trades_today"] = rebalance_results.get(inv_id, {}).get("trades", [])
        results.append(result)

    results.sort(key=lambda x: x["total_return_pct"], reverse=True)

    report = {
        "date": date_str,
        "generated_at": datetime.now().isoformat(),
        "market_prices": {
            ticker: {
                "name": data["name"],
                "price": data["price"],
                "change_pct": data["change_pct"],
            }
            for ticker, data in current_prices.items()
        },
        "rankings": [
            {
                "rank": i + 1,
                "investor": r["investor"],
                "strategy": r["strategy"],
                "total_asset": r["total_asset"],
                "total_return": r["total_return"],
                "total_return_pct": r["total_return_pct"],
                "num_holdings": r["num_holdings"],
                "cash_ratio": r["cash_ratio"],
                "rebalance_frequency_days": r["rebalance_frequency_days"],
                "rebalanced_today": r["rebalanced_today"],
                "total_rebalances": r["total_rebalances"],
            }
            for i, r in enumerate(results)
        ],
        "investor_details": {r["investor"]: r for r in results},
    }

    daily_dir = Path(BASE_DIR / "report" / "daily")
    daily_dir.mkdir(parents=True, exist_ok=True)

    path = daily_dir / f"{date_str}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2, default=str)

    return report


if __name__ == "__main__":
    target_date = sys.argv[1] if len(sys.argv) > 1 else None
    run_simulation(target_date)
