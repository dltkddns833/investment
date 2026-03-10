"""기존 JSON 데이터를 Supabase로 마이그레이션하는 1회성 스크립트"""
import json
from pathlib import Path

# supabase_client.py와 같은 디렉토리이므로 직접 import
from supabase_client import supabase

BASE_DIR = Path(__file__).resolve().parent.parent


def migrate_config():
    """config.json → config 테이블"""
    path = BASE_DIR / "config.json"
    with open(path, "r", encoding="utf-8") as f:
        config = json.load(f)

    supabase.table("config").upsert({
        "id": 1,
        "simulation": config["simulation"],
        "investors": config["investors"],
        "stock_universe": config["stock_universe"],
        "news_categories": config.get("news_categories", []),
    }).execute()
    print("config 마이그레이션 완료")


def migrate_profiles():
    """investors/profiles/*.json → profiles 테이블"""
    profiles_dir = BASE_DIR / "investors" / "profiles"
    for path in sorted(profiles_dir.glob("*.json")):
        investor_id = path.stem
        with open(path, "r", encoding="utf-8") as f:
            profile = json.load(f)

        supabase.table("profiles").upsert({
            "id": investor_id,
            "name": profile["name"],
            "strategy": profile["strategy"],
            "description": profile.get("description", ""),
            "rebalance_frequency_days": profile["rebalance_frequency_days"],
            "risk_tolerance": profile["risk_tolerance"],
            "analysis_criteria": profile.get("analysis_criteria", []),
            "investment_style": profile.get("investment_style", {}),
        }).execute()
        print(f"  profiles/{investor_id} 완료")

    print("profiles 마이그레이션 완료")


def migrate_portfolios():
    """investors/portfolios/*.json → portfolios + transactions + rebalance_history 테이블"""
    portfolios_dir = BASE_DIR / "investors" / "portfolios"
    for path in sorted(portfolios_dir.glob("*.json")):
        investor_id = path.stem
        with open(path, "r", encoding="utf-8") as f:
            portfolio = json.load(f)

        # portfolios 테이블
        supabase.table("portfolios").upsert({
            "investor_id": investor_id,
            "investor": portfolio["investor"],
            "strategy": portfolio["strategy"],
            "initial_capital": portfolio["initial_capital"],
            "cash": portfolio["cash"],
            "holdings": portfolio["holdings"],
            "last_rebalanced": portfolio.get("last_rebalanced"),
        }).execute()
        print(f"  portfolios/{investor_id} 완료")

        # transactions 테이블
        for txn in portfolio.get("transactions", []):
            supabase.table("transactions").insert({
                "investor_id": investor_id,
                "date": txn["date"],
                "type": txn["type"],
                "ticker": txn["ticker"],
                "name": txn["name"],
                "shares": txn["shares"],
                "price": txn["price"],
                "amount": txn["amount"],
                "profit": txn.get("profit"),
            }).execute()
        print(f"  transactions/{investor_id}: {len(portfolio.get('transactions', []))}건")

        # rebalance_history 테이블
        for reb in portfolio.get("rebalance_history", []):
            supabase.table("rebalance_history").insert({
                "investor_id": investor_id,
                "date": reb["date"],
                "trades": reb["trades"],
                "total_asset_after": reb["total_asset_after"],
            }).execute()
        print(f"  rebalance_history/{investor_id}: {len(portfolio.get('rebalance_history', []))}건")

    print("portfolios 마이그레이션 완료")


def migrate_allocations():
    """investors/allocations/{id}/{date}.json → allocations 테이블"""
    alloc_dir = BASE_DIR / "investors" / "allocations"
    count = 0
    for investor_dir in sorted(alloc_dir.iterdir()):
        if not investor_dir.is_dir():
            continue
        investor_id = investor_dir.name
        for path in sorted(investor_dir.glob("*.json")):
            with open(path, "r", encoding="utf-8") as f:
                alloc = json.load(f)

            supabase.table("allocations").upsert({
                "investor_id": investor_id,
                "date": alloc["date"],
                "investor": alloc["investor"],
                "strategy": alloc["strategy"],
                "rationale": alloc.get("rationale", ""),
                "allocation": alloc["allocation"],
                "allocation_sum": alloc["allocation_sum"],
                "num_stocks": alloc["num_stocks"],
                "generated_at": alloc.get("generated_at"),
            }).execute()
            count += 1

    print(f"allocations 마이그레이션 완료 ({count}건)")


def migrate_news():
    """news/{date}.json → news 테이블"""
    news_dir = BASE_DIR / "news"
    if not news_dir.exists():
        print("news 디렉토리 없음, 스킵")
        return

    count = 0
    for path in sorted(news_dir.glob("*.json")):
        with open(path, "r", encoding="utf-8") as f:
            news = json.load(f)

        supabase.table("news").upsert({
            "date": news["date"],
            "collected_at": news.get("collected_at"),
            "count": news["count"],
            "articles": news["articles"],
        }).execute()
        count += 1

    print(f"news 마이그레이션 완료 ({count}건)")


def migrate_daily_reports():
    """report/daily/{date}.json → daily_reports 테이블"""
    report_dir = BASE_DIR / "report" / "daily"
    if not report_dir.exists():
        print("report/daily 디렉토리 없음, 스킵")
        return

    count = 0
    for path in sorted(report_dir.glob("*.json")):
        with open(path, "r", encoding="utf-8") as f:
            report = json.load(f)

        supabase.table("daily_reports").upsert({
            "date": report["date"],
            "generated_at": report.get("generated_at"),
            "market_prices": report.get("market_prices", {}),
            "rankings": report.get("rankings", []),
            "investor_details": report.get("investor_details", {}),
        }).execute()
        count += 1

    print(f"daily_reports 마이그레이션 완료 ({count}건)")


def main():
    print("=" * 50)
    print(" Supabase 마이그레이션 시작")
    print("=" * 50)

    migrate_config()
    migrate_profiles()
    migrate_portfolios()
    migrate_allocations()
    migrate_news()
    migrate_daily_reports()

    print("\n" + "=" * 50)
    print(" 마이그레이션 완료!")
    print("=" * 50)


if __name__ == "__main__":
    main()
