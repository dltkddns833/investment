"""일일 시뮬레이션 오케스트레이터"""
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from supabase_client import supabase
from market import get_stock_prices
from portfolio import (
    get_all_investors,
    is_rebalance_due,
    load_portfolio,
    load_profile,
    rebalance,
    evaluate,
)


def load_investor_allocation(investor_id, date_str):
    """투자자별 개별 배분 로드 (Supabase)"""
    result = supabase.table("allocations").select("*").eq("investor_id", investor_id).eq("date", date_str).execute()
    if not result.data:
        return None
    return result.data[0]


def run_simulation(date_str=None):
    """일일 시뮬레이션 실행"""
    if date_str is None:
        date_str = datetime.now().strftime("%Y-%m-%d")

    print(f"\n{'='*60}")
    print(f" 시뮬레이션 실행: {date_str}")
    print(f"{'='*60}")

    # 1. 현재 주가 조회
    print(f"\n [주가 조회 중...]")
    current_prices = get_stock_prices(price_type="open")
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

    print(f"\n 리포트 저장 완료: daily_reports/{date_str}")
    print(f"{'='*60}\n")

    return report


def generate_daily_report_with_rebalance(current_prices, date_str, rebalance_results):
    """리밸런싱 정보가 포함된 일간 리포트 생성 (Supabase)

    같은 날 재실행 시 기존 리포트의 rebalanced_today를 병합(OR)한다.
    """
    # 기존 리포트에서 rebalanced_today 상태 로드 (같은 날 재실행 대비)
    prev_rebalanced = {}
    prev_trades = {}
    existing = supabase.table("daily_reports").select("rankings, investor_details").eq("date", date_str).execute().data
    if existing:
        for r in existing[0]["rankings"]:
            prev_rebalanced[r["investor"]] = r.get("rebalanced_today", False)
        for name, detail in existing[0]["investor_details"].items():
            prev_trades[name] = detail.get("trades_today", [])

    investors = get_all_investors()
    results = []

    for inv_id in investors:
        result = evaluate(inv_id, current_prices)
        profile = load_profile(inv_id)
        portfolio = load_portfolio(inv_id)

        result["rebalance_frequency_days"] = profile["rebalance_frequency_days"]
        rebalanced_now = rebalance_results.get(inv_id, {}).get("rebalanced", False)
        rebalanced_prev = prev_rebalanced.get(result["investor"], False)
        result["rebalanced_today"] = rebalanced_now or rebalanced_prev
        result["total_rebalances"] = len(portfolio.get("rebalance_history", []))
        trades_now = rebalance_results.get(inv_id, {}).get("trades", [])
        if rebalanced_now:
            result["trades_today"] = trades_now
        else:
            result["trades_today"] = prev_trades.get(result["investor"], [])
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

    # Supabase에 upsert
    supabase.table("daily_reports").upsert({
        "date": date_str,
        "generated_at": report["generated_at"],
        "market_prices": report["market_prices"],
        "rankings": report["rankings"],
        "investor_details": report["investor_details"],
    }).execute()

    return report


def update_closing_prices(date_str=None):
    """장마감 후 종가로 daily_reports 업데이트

    매매 정보(trades_today, rebalanced_today 등)는 유지하고
    시세와 포트폴리오 평가만 종가 기준으로 갱신한다.
    """
    if date_str is None:
        date_str = datetime.now().strftime("%Y-%m-%d")

    print(f"\n{'='*60}")
    print(f" 종가 업데이트: {date_str}")
    print(f"{'='*60}")

    # 기존 리포트 로드
    existing = supabase.table("daily_reports").select("*").eq("date", date_str).execute().data
    if not existing:
        print("[오류] 해당 날짜의 리포트가 없습니다")
        return None

    prev_report = existing[0]

    # 종가 조회
    print(f"\n [종가 조회 중...]")
    closing_prices = get_stock_prices(price_type="close")
    if not closing_prices:
        print("[오류] 종가 조회 실패")
        return None

    for ticker, data in closing_prices.items():
        print(f"  {data['name']}: {data['price']:,}원 ({'+' if data['change_pct'] >= 0 else ''}{data['change_pct']:.2f}%)")

    # 종가 기준으로 포트폴리오 재평가
    investors = get_all_investors()
    results = []

    print(f"\n [종가 기준 재평가]")
    for inv_id in sorted(investors):
        result = evaluate(inv_id, closing_prices)
        profile = load_profile(inv_id)
        portfolio = load_portfolio(inv_id)

        # 매매 정보는 기존 리포트에서 유지
        prev_detail = prev_report["investor_details"].get(result["investor"], {})
        result["rebalance_frequency_days"] = profile["rebalance_frequency_days"]
        result["rebalanced_today"] = prev_detail.get("rebalanced_today", False)
        result["total_rebalances"] = prev_detail.get("total_rebalances", 0)
        result["trades_today"] = prev_detail.get("trades_today", [])
        results.append(result)

        sign = "+" if result["total_return"] >= 0 else ""
        print(f"  {result['investor']}: {result['total_asset']:,}원 ({sign}{result['total_return_pct']:.2f}%)")

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
            for ticker, data in closing_prices.items()
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

    supabase.table("daily_reports").upsert({
        "date": date_str,
        "generated_at": report["generated_at"],
        "market_prices": report["market_prices"],
        "rankings": report["rankings"],
        "investor_details": report["investor_details"],
    }).execute()

    print(f"\n 종가 반영 완료: daily_reports/{date_str}")
    print(f"{'='*60}\n")

    return report


if __name__ == "__main__":
    target_date = sys.argv[1] if len(sys.argv) > 1 else None
    if len(sys.argv) > 2 and sys.argv[2] == "--close":
        update_closing_prices(target_date)
    else:
        run_simulation(target_date)
