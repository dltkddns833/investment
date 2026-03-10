"""투자 리포트 생성 모듈"""
import json
from datetime import datetime
from pathlib import Path
from portfolio import load_portfolio, load_profile, evaluate, get_all_investors

BASE_DIR = Path(__file__).resolve().parent.parent
REPORT_DIR = BASE_DIR / "report"

def generate_daily_report(current_prices, date=None):
    """일간 리포트 생성"""
    if date is None:
        date = datetime.now().strftime("%Y-%m-%d")

    investors = get_all_investors()
    results = []

    for inv_id in investors:
        result = evaluate(inv_id, current_prices)
        results.append(result)

    results.sort(key=lambda x: x["total_return_pct"], reverse=True)

    report = {
        "date": date,
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
                "rebalance_frequency_days": r.get("rebalance_frequency_days"),
                "rebalanced_today": r.get("rebalanced_today", False),
                "total_rebalances": r.get("total_rebalances", 0),
            }
            for i, r in enumerate(results)
        ],
        "investor_details": {r["investor"]: r for r in results},
    }

    daily_dir = REPORT_DIR / "daily"
    daily_dir.mkdir(parents=True, exist_ok=True)

    path = daily_dir / f"{date}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    return report

def print_daily_report(current_prices, date=None):
    """일간 리포트 출력"""
    report = generate_daily_report(current_prices, date)

    print(f"\n{'='*70}")
    print(f" 일간 투자 시뮬레이션 리포트 - {report['date']}")
    print(f"{'='*70}")

    print(f"\n [순위표]")
    print(f" {'순위':>4} {'투자자':>6} {'전략':>12} {'총자산':>15} {'수익률':>8}")
    print(f" {'-'*52}")

    for r in report["rankings"]:
        sign = "+" if r["total_return_pct"] >= 0 else ""
        print(
            f" {r['rank']:>4} {r['investor']:>6} {r['strategy']:>12} "
            f"{r['total_asset']:>15,} {sign}{r['total_return_pct']:>7.2f}%"
        )

    print(f"\n [시장 현황]")
    for ticker, data in report["market_prices"].items():
        sign = "+" if data["change_pct"] >= 0 else ""
        print(f"  {data['name']}: {data['price']:,}원 ({sign}{data['change_pct']:.2f}%)")

    print(f"{'='*70}\n")
    return report

def generate_summary_report(current_prices):
    """전체 요약 리포트 생성"""
    investors = get_all_investors()
    summary = {"generated_at": datetime.now().isoformat(), "investors": {}}

    for inv_id in investors:
        portfolio = load_portfolio(inv_id)
        result = evaluate(inv_id, current_prices)
        profile = load_profile(inv_id)

        total_trades = len(portfolio["transactions"])
        buy_trades = sum(1 for t in portfolio["transactions"] if t["type"] == "buy")
        sell_trades = sum(1 for t in portfolio["transactions"] if t["type"] == "sell")
        realized_profit = sum(
            t.get("profit", 0) for t in portfolio["transactions"] if t["type"] == "sell"
        )

        summary["investors"][inv_id] = {
            "name": result["investor"],
            "strategy": result["strategy"],
            "description": profile["description"],
            "total_asset": result["total_asset"],
            "total_return": result["total_return"],
            "total_return_pct": result["total_return_pct"],
            "cash": result["cash"],
            "cash_ratio": result["cash_ratio"],
            "num_holdings": result["num_holdings"],
            "total_trades": total_trades,
            "buy_trades": buy_trades,
            "sell_trades": sell_trades,
            "realized_profit": realized_profit,
        }

    path = REPORT_DIR / "summary" / "overall.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    return summary

if __name__ == "__main__":
    from market import get_stock_prices
    prices = get_stock_prices()
    print_daily_report(prices)
