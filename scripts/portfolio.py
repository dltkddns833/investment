"""포트폴리오 관리 모듈"""
import json
from datetime import datetime, date
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
PORTFOLIOS_DIR = BASE_DIR / "investors" / "portfolios"
PROFILES_DIR = BASE_DIR / "investors" / "profiles"

def load_portfolio(investor_id):
    """투자자 포트폴리오 로드"""
    path = PORTFOLIOS_DIR / f"{investor_id}.json"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_portfolio(investor_id, portfolio):
    """투자자 포트폴리오 저장"""
    path = PORTFOLIOS_DIR / f"{investor_id}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(portfolio, f, ensure_ascii=False, indent=2)

def load_profile(investor_id):
    """투자자 프로필 로드"""
    path = PROFILES_DIR / f"{investor_id}.json"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def buy(investor_id, ticker, name, shares, price):
    """주식 매수"""
    portfolio = load_portfolio(investor_id)
    cost = shares * price

    if cost > portfolio["cash"]:
        return False, f"잔액 부족 (필요: {cost:,}원, 보유: {portfolio['cash']:,}원)"

    portfolio["cash"] -= cost

    if ticker in portfolio["holdings"]:
        h = portfolio["holdings"][ticker]
        total_shares = h["shares"] + shares
        h["avg_price"] = int((h["shares"] * h["avg_price"] + cost) / total_shares)
        h["shares"] = total_shares
    else:
        portfolio["holdings"][ticker] = {
            "name": name,
            "shares": shares,
            "avg_price": price,
        }

    portfolio["transactions"].append({
        "date": datetime.now().strftime("%Y-%m-%d"),
        "type": "buy",
        "ticker": ticker,
        "name": name,
        "shares": shares,
        "price": price,
        "amount": cost,
    })

    save_portfolio(investor_id, portfolio)
    return True, f"{name} {shares}주 매수 완료 ({price:,}원 x {shares} = {cost:,}원)"

def sell(investor_id, ticker, shares, price):
    """주식 매도"""
    portfolio = load_portfolio(investor_id)

    if ticker not in portfolio["holdings"]:
        return False, "보유하지 않은 종목"

    h = portfolio["holdings"][ticker]
    if shares > h["shares"]:
        return False, f"보유 수량 부족 (보유: {h['shares']}주, 매도 요청: {shares}주)"

    revenue = shares * price
    profit = (price - h["avg_price"]) * shares
    name = h["name"]

    portfolio["cash"] += revenue
    h["shares"] -= shares

    if h["shares"] == 0:
        del portfolio["holdings"][ticker]

    portfolio["transactions"].append({
        "date": datetime.now().strftime("%Y-%m-%d"),
        "type": "sell",
        "ticker": ticker,
        "name": name,
        "shares": shares,
        "price": price,
        "amount": revenue,
        "profit": profit,
    })

    save_portfolio(investor_id, portfolio)
    sign = "+" if profit >= 0 else ""
    return True, f"{name} {shares}주 매도 완료 (수익: {sign}{profit:,}원)"

def evaluate(investor_id, current_prices):
    """포트폴리오 평가"""
    portfolio = load_portfolio(investor_id)
    profile = load_profile(investor_id)

    total_invested = 0
    total_value = 0
    holdings_detail = {}

    for ticker, h in portfolio["holdings"].items():
        if ticker not in current_prices:
            continue
        cp = current_prices[ticker]["price"]
        invested = h["shares"] * h["avg_price"]
        value = h["shares"] * cp
        profit = value - invested
        profit_pct = (cp / h["avg_price"] - 1) * 100

        total_invested += invested
        total_value += value

        holdings_detail[ticker] = {
            "name": h["name"],
            "shares": h["shares"],
            "avg_price": h["avg_price"],
            "current_price": cp,
            "invested": invested,
            "value": value,
            "profit": profit,
            "profit_pct": round(profit_pct, 2),
        }

    total_asset = portfolio["cash"] + total_value
    total_return = total_asset - portfolio["initial_capital"]
    total_return_pct = (total_asset / portfolio["initial_capital"] - 1) * 100

    return {
        "investor": portfolio["investor"],
        "strategy": portfolio["strategy"],
        "initial_capital": portfolio["initial_capital"],
        "cash": portfolio["cash"],
        "holdings_value": total_value,
        "total_asset": total_asset,
        "total_return": total_return,
        "total_return_pct": round(total_return_pct, 2),
        "holdings": holdings_detail,
        "num_holdings": len(holdings_detail),
        "cash_ratio": round(portfolio["cash"] / total_asset * 100, 1),
    }

def print_portfolio(investor_id, current_prices):
    """포트폴리오 상세 출력"""
    result = evaluate(investor_id, current_prices)
    sign = "+" if result["total_return"] >= 0 else ""

    print(f"\n{'='*70}")
    print(f" {result['investor']} ({result['strategy']})")
    print(f"{'='*70}")
    print(f" 총 자산: {result['total_asset']:>15,}원 ({sign}{result['total_return_pct']:.2f}%)")
    print(f" 현금:    {result['cash']:>15,}원 (현금비중 {result['cash_ratio']}%)")
    print(f" 평가금:  {result['holdings_value']:>15,}원")
    print(f" 수익금:  {sign}{result['total_return']:>14,}원")

    if result["holdings"]:
        print(f"\n {'종목':>10} {'수량':>6} {'평단가':>10} {'현재가':>10} {'평가금':>12} {'수익률':>8}")
        print(f" {'-'*62}")
        for ticker, h in result["holdings"].items():
            s = "+" if h["profit_pct"] >= 0 else ""
            print(
                f" {h['name']:>10} {h['shares']:>6} "
                f"{h['avg_price']:>10,} {h['current_price']:>10,} "
                f"{h['value']:>12,} {s}{h['profit_pct']:>7.2f}%"
            )
    else:
        print("\n 보유 종목 없음")
    print(f"{'='*70}\n")
    return result

def get_all_investors():
    """모든 투자자 ID 목록"""
    return [p.stem for p in PROFILES_DIR.glob("*.json")]


def is_rebalance_due(investor_id, current_date):
    """리밸런싱 실행 여부 판단"""
    profile = load_profile(investor_id)
    portfolio = load_portfolio(investor_id)
    frequency = profile["rebalance_frequency_days"]
    last = portfolio.get("last_rebalanced")

    if last is None:
        return True

    if isinstance(current_date, str):
        current_date = datetime.strptime(current_date, "%Y-%m-%d").date()
    last_date = datetime.strptime(last, "%Y-%m-%d").date()
    days_since = (current_date - last_date).days

    return days_since >= frequency


def rebalance(investor_id, target_allocation, current_prices, current_date):
    """목표 배분에 맞춰 포트폴리오 리밸런싱 실행

    1) 매도 먼저 (목표 비중 초과 또는 목표에 없는 종목)
    2) 매수 실행 (목표 비중 미달 종목)
    3) last_rebalanced 업데이트
    """
    if isinstance(current_date, date):
        date_str = current_date.strftime("%Y-%m-%d")
    else:
        date_str = current_date

    portfolio = load_portfolio(investor_id)
    total_asset = portfolio["cash"]
    for ticker, h in portfolio["holdings"].items():
        if ticker in current_prices:
            total_asset += h["shares"] * current_prices[ticker]["price"]

    trades = []

    # 1) 매도: 목표에 없거나 비중 초과 종목
    for ticker in list(portfolio["holdings"].keys()):
        if ticker not in current_prices:
            continue
        price = current_prices[ticker]["price"]
        h = portfolio["holdings"][ticker]
        current_value = h["shares"] * price
        target_pct = target_allocation.get(ticker, 0)
        target_value = total_asset * target_pct
        diff = current_value - target_value

        if diff > price:  # 1주 이상 매도 필요
            sell_shares = int(diff / price)
            if sell_shares > 0 and sell_shares <= h["shares"]:
                success, msg = sell(investor_id, ticker, sell_shares, price)
                if success:
                    trades.append({"type": "sell", "ticker": ticker, "shares": sell_shares, "price": price})
                    portfolio = load_portfolio(investor_id)  # 갱신

    # 총 자산 재계산 (매도 후)
    portfolio = load_portfolio(investor_id)
    total_asset = portfolio["cash"]
    for ticker, h in portfolio["holdings"].items():
        if ticker in current_prices:
            total_asset += h["shares"] * current_prices[ticker]["price"]

    # 2) 매수: 비중 미달 종목
    for ticker, target_pct in target_allocation.items():
        if target_pct <= 0 or ticker not in current_prices:
            continue
        price = current_prices[ticker]["price"]
        name = current_prices[ticker]["name"]

        current_value = 0
        if ticker in portfolio["holdings"]:
            current_value = portfolio["holdings"][ticker]["shares"] * price

        target_value = total_asset * target_pct
        diff = target_value - current_value

        if diff > price:  # 1주 이상 매수 필요
            buy_shares = int(diff / price)
            portfolio = load_portfolio(investor_id)  # 최신 잔액 확인
            max_affordable = int(portfolio["cash"] / price)
            buy_shares = min(buy_shares, max_affordable)

            if buy_shares > 0:
                success, msg = buy(investor_id, ticker, name, buy_shares, price)
                if success:
                    trades.append({"type": "buy", "ticker": ticker, "shares": buy_shares, "price": price})

    # 3) last_rebalanced 업데이트
    portfolio = load_portfolio(investor_id)
    portfolio["last_rebalanced"] = date_str
    portfolio["rebalance_history"].append({
        "date": date_str,
        "trades": trades,
        "total_asset_after": portfolio["cash"] + sum(
            h["shares"] * current_prices.get(t, {}).get("price", 0)
            for t, h in portfolio["holdings"].items()
        ),
    })
    save_portfolio(investor_id, portfolio)

    return trades
