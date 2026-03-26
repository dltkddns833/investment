"""백테스트 엔진 — 인메모리 포트폴리오 + 시뮬레이션 루프"""
import copy
from datetime import datetime, date, timedelta
import holidays

from .strategies import get_strategy
from .price_cache import load_or_download, get_prices_at_date
from .metrics import compute_metrics


class InMemoryPortfolio:
    """portfolio.py의 인메모리 버전 (DB 접근 없음)"""

    def __init__(self, investor_id, name, strategy,
                 rebalance_frequency_days, initial_capital=5_000_000, trading_costs=None):
        self.investor_id = investor_id
        self.name = name
        self.strategy = strategy
        self.rebalance_frequency_days = rebalance_frequency_days
        self.initial_capital = initial_capital
        self.cash = initial_capital
        self.holdings = {}  # {ticker: {"name", "shares", "avg_price", "target_state"}}
        self.last_rebalanced = None
        self.trading_costs = trading_costs or {}
        self.daily_snapshots = []  # [(date_str, total_asset, cash, holdings_copy)]
        self.transactions = []  # for win rate

    def calc_fees(self, ticker, price, shares, trade_type):
        """portfolio.py:calc_fees()와 동일"""
        tc = self.trading_costs
        slippage = tc.get("slippage_pct", 0)

        if trade_type == "buy":
            exec_price = int(price * (1 + slippage))
            commission_pct = tc.get("buy_commission_pct", 0)
            fee = int(exec_price * shares * commission_pct)
        else:
            exec_price = int(price * (1 - slippage))
            commission_pct = tc.get("sell_commission_pct", 0)
            suffix = "KQ" if ticker.endswith(".KQ") else "KS"
            tax_pct = tc.get("sell_tax_pct", {}).get(suffix, 0)
            fee = int(exec_price * shares * (commission_pct + tax_pct))

        return exec_price, fee

    def evaluate(self, current_prices):
        """portfolio.py:evaluate()와 동일"""
        total_value = 0
        holdings_detail = {}

        for ticker, h in self.holdings.items():
            if ticker not in current_prices:
                continue
            cp = current_prices[ticker]["price"]
            invested = h["shares"] * h["avg_price"]
            value = h["shares"] * cp
            profit = value - invested
            profit_pct = (cp / h["avg_price"] - 1) * 100

            total_value += value
            holdings_detail[ticker] = {
                "name": h["name"],
                "shares": h["shares"],
                "avg_price": h["avg_price"],
                "current_price": cp,
                "value": value,
                "profit": profit,
                "profit_pct": round(profit_pct, 2),
            }

        total_asset = self.cash + total_value
        total_return = total_asset - self.initial_capital
        total_return_pct = (total_asset / self.initial_capital - 1) * 100

        return {
            "investor_id": self.investor_id,
            "investor": self.name,
            "strategy": self.strategy,
            "initial_capital": self.initial_capital,
            "cash": self.cash,
            "holdings_value": total_value,
            "total_asset": total_asset,
            "total_return": total_return,
            "total_return_pct": round(total_return_pct, 2),
            "num_holdings": len(holdings_detail),
        }

    def rebalance(self, target_allocation, current_prices, date_str):
        """portfolio.py:rebalance()와 동일 로직 (DB 저장 제외)"""
        total_asset = self.cash
        for ticker, h in self.holdings.items():
            if ticker in current_prices:
                total_asset += h["shares"] * current_prices[ticker]["price"]

        trades = []

        # 1) 매도: 목표에 없거나 비중 초과
        for ticker in list(self.holdings.keys()):
            if ticker not in current_prices:
                continue
            price = current_prices[ticker]["price"]
            h = self.holdings[ticker]
            current_value = h["shares"] * price
            target_pct = target_allocation.get(ticker, 0)
            target_value = total_asset * target_pct
            diff = current_value - target_value

            if diff > price:
                sell_shares = int(diff / price)
                if 0 < sell_shares <= h["shares"]:
                    exec_price, fee = self.calc_fees(ticker, price, sell_shares, "sell")
                    revenue = sell_shares * exec_price
                    profit = (exec_price - h["avg_price"]) * sell_shares

                    self.cash += revenue - fee
                    h["shares"] -= sell_shares
                    if h["shares"] == 0:
                        del self.holdings[ticker]

                    trades.append({"type": "sell", "ticker": ticker,
                                   "shares": sell_shares, "price": exec_price})
                    self.transactions.append({"type": "sell", "profit": profit,
                                              "date": date_str})

        # 총 자산 재계산
        total_asset = self.cash
        for ticker, h in self.holdings.items():
            if ticker in current_prices:
                total_asset += h["shares"] * current_prices[ticker]["price"]

        # 2) 매수: 비중 미달
        for ticker, target_pct in target_allocation.items():
            if target_pct <= 0 or ticker not in current_prices:
                continue
            price = current_prices[ticker]["price"]
            name = current_prices[ticker]["name"]

            current_value = 0
            if ticker in self.holdings:
                current_value = self.holdings[ticker]["shares"] * price

            target_value = total_asset * target_pct
            diff = target_value - current_value

            if diff > price:
                buy_shares = int(diff / price)
                tc = self.trading_costs
                exec_price_est = int(price * (1 + tc.get("slippage_pct", 0)))
                buy_commission = tc.get("buy_commission_pct", 0)
                cost_per_share = exec_price_est + int(exec_price_est * buy_commission)
                max_affordable = int(self.cash / cost_per_share) if cost_per_share > 0 else 0
                buy_shares = min(buy_shares, max_affordable)

                if buy_shares > 0:
                    exec_price, fee = self.calc_fees(ticker, price, buy_shares, "buy")
                    cost = buy_shares * exec_price
                    self.cash -= cost + fee

                    if ticker in self.holdings:
                        existing = self.holdings[ticker]
                        total_shares = existing["shares"] + buy_shares
                        existing["avg_price"] = int(
                            (existing["shares"] * existing["avg_price"] + cost) / total_shares
                        )
                        existing["shares"] = total_shares
                    else:
                        self.holdings[ticker] = {
                            "name": name,
                            "shares": buy_shares,
                            "avg_price": exec_price,
                        }

                    trades.append({"type": "buy", "ticker": ticker,
                                   "shares": buy_shares, "price": exec_price})

        self.last_rebalanced = date_str
        return trades

    def check_target_prices(self, current_prices, date_str,
                            sell_tranches=None, stop_loss=-0.10):
        """portfolio.py:check_target_prices()와 동일 (L, O 전용)"""
        if sell_tranches is None:
            sell_tranches = [
                {"threshold": 0.15, "sell_ratio": 1/3},
                {"threshold": 0.30, "sell_ratio": 0.5},
                {"threshold": 0.50, "sell_ratio": 1.0},
            ]

        trades = []
        for ticker in list(self.holdings.keys()):
            if ticker not in current_prices:
                continue

            h = self.holdings[ticker]
            price = current_prices[ticker]["price"]
            profit_pct = price / h["avg_price"] - 1

            if "target_state" not in h:
                h["target_state"] = {"triggered": []}
            triggered = h["target_state"]["triggered"]

            # 손절
            if profit_pct <= stop_loss:
                sell_shares = h["shares"]
                exec_price, fee = self.calc_fees(ticker, price, sell_shares, "sell")
                revenue = sell_shares * exec_price
                profit = (exec_price - h["avg_price"]) * sell_shares

                self.cash += revenue - fee
                del self.holdings[ticker]
                trades.append({"type": "sell", "ticker": ticker, "shares": sell_shares,
                               "price": exec_price, "reason": f"손절 ({profit_pct*100:.1f}%)"})
                self.transactions.append({"type": "sell", "profit": profit, "date": date_str})
                continue

            # 분할매도
            for tranche in sell_tranches:
                threshold = tranche["threshold"]
                if threshold in triggered:
                    continue
                if profit_pct >= threshold:
                    sell_shares = max(1, int(h["shares"] * tranche["sell_ratio"]))
                    sell_shares = min(sell_shares, h["shares"])
                    if sell_shares <= 0:
                        continue

                    exec_price, fee = self.calc_fees(ticker, price, sell_shares, "sell")
                    revenue = sell_shares * exec_price
                    profit = (exec_price - h["avg_price"]) * sell_shares

                    self.cash += revenue - fee
                    h["shares"] -= sell_shares
                    triggered.append(threshold)
                    trades.append({"type": "sell", "ticker": ticker, "shares": sell_shares,
                                   "price": exec_price, "reason": f"익절 +{threshold*100:.0f}%"})
                    self.transactions.append({"type": "sell", "profit": profit, "date": date_str})

                    if h["shares"] == 0:
                        del self.holdings[ticker]
                        break

        return trades

    def is_rebalance_due(self, current_date):
        """portfolio.py:is_rebalance_due()와 동일"""
        if self.last_rebalanced is None:
            return True

        if isinstance(current_date, str):
            current_date = datetime.strptime(current_date, "%Y-%m-%d").date()

        last_date = datetime.strptime(self.last_rebalanced, "%Y-%m-%d").date()

        kr_holidays = holidays.KR(years=range(last_date.year, current_date.year + 1))
        count = 0
        d = last_date + timedelta(days=1)
        while d <= current_date:
            if d.weekday() < 5 and d not in kr_holidays:
                count += 1
            d += timedelta(days=1)

        return count >= self.rebalance_frequency_days

    def snapshot(self, date_str, current_prices):
        """일별 스냅샷 기록"""
        eval_result = self.evaluate(current_prices)
        self.daily_snapshots.append((
            date_str,
            eval_result["total_asset"],
            self.cash,
            copy.deepcopy(self.holdings),
        ))


def get_trading_days(start_date, end_date):
    """영업일 목록 생성 (주말 + 한국 공휴일 제외)"""
    if isinstance(start_date, str):
        start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
    if isinstance(end_date, str):
        end_date = datetime.strptime(end_date, "%Y-%m-%d").date()

    kr_holidays = holidays.KR(years=range(start_date.year, end_date.year + 1))
    days = []
    d = start_date
    while d <= end_date:
        if d.weekday() < 5 and d not in kr_holidays:
            days.append(d)
        d += timedelta(days=1)
    return days


def run_backtest(start_date, end_date, investor_ids=None, use_cache=True,
                 initial_capital=5_000_000, config=None, save_to_db=True):
    """백테스트 메인 루프

    Args:
        start_date, end_date: "YYYY-MM-DD"
        investor_ids: ["A", "B", ...] 또는 None (전체)
        use_cache: 가격 캐시 사용 여부
        initial_capital: 초기 자본
        config: config dict (None이면 Supabase에서 로드)
        save_to_db: 결과를 Supabase에 저장할지 여부

    Returns:
        dict with results
    """
    import sys
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "core"))

    # 1. Config 로드
    if config is None:
        from market import load_config
        config = load_config()

    universe_map = {s["ticker"]: s for s in config["stock_universe"]}
    tickers = list(universe_map.keys())
    trading_costs = config.get("simulation", {}).get("trading_costs") or {}

    # config에서 trading_costs 로드 (별도 필드일 수 있음)
    if not trading_costs:
        from supabase_client import supabase
        row = supabase.table("config").select("trading_costs").eq("id", 1).single().execute().data
        trading_costs = row.get("trading_costs") or {}

    # 투자자 프로필 로드
    from supabase_client import supabase
    profiles_data = supabase.table("profiles").select("*").execute().data
    profiles = {p["id"]: p for p in profiles_data}

    if investor_ids is None:
        investor_ids = sorted(profiles.keys())

    # 2. 가격 데이터 로드
    price_df = load_or_download(tickers, start_date, end_date, use_cache=use_cache)

    # 3. 영업일 목록
    trading_days = get_trading_days(start_date, end_date)
    print(f"\n📊 백테스트 시작: {start_date} ~ {end_date} ({len(trading_days)} 영업일)")
    print(f"   투자자: {', '.join(investor_ids)} ({len(investor_ids)}명)")
    print(f"   초기 자본: {initial_capital:,}원\n")

    # 4. 포트폴리오 초기화
    portfolios = {}
    for inv_id in investor_ids:
        profile = profiles.get(inv_id, {})
        portfolios[inv_id] = InMemoryPortfolio(
            investor_id=inv_id,
            name=profile.get("name", inv_id),
            strategy=profile.get("strategy", ""),
            rebalance_frequency_days=profile.get("rebalance_frequency_days", 1),
            initial_capital=initial_capital,
            trading_costs=trading_costs,
        )

    # 5. 시뮬레이션 루프
    progress_interval = max(1, len(trading_days) // 10)

    for i, day in enumerate(trading_days):
        date_str = day.strftime("%Y-%m-%d")

        # 진행률 표시
        if i % progress_interval == 0:
            pct = int(i / len(trading_days) * 100)
            print(f"   [{pct:>3}%] {date_str} 처리 중...")

        # 당일 가격
        prices = get_prices_at_date(price_df, day, universe_map)
        if not prices:
            continue

        for inv_id in investor_ids:
            pf = portfolios[inv_id]
            strategy_fn = get_strategy(inv_id)

            # 리밸런싱 체크
            if pf.is_rebalance_due(day):
                if strategy_fn:
                    allocation = strategy_fn(price_df, day, universe_map)
                    if allocation:
                        pf.rebalance(allocation, prices, date_str)

            # L은 매일 분할매도 체크
            if inv_id == "L" and pf.holdings:
                pf.check_target_prices(prices, date_str)

            # O는 매일 포트폴리오 전체 수익률 체크 (전일 대비 +5% 익절, -3% 손절 → 전 종목 매도)
            if inv_id == "O" and pf.holdings:
                prev_total = pf.daily_snapshots[-1][1] if pf.daily_snapshots else initial_capital
                eval_total = pf.cash + sum(
                    pf.holdings[t]["shares"] * prices[t]["price"]
                    for t in pf.holdings if t in prices
                )
                daily_ret = (eval_total / prev_total - 1) if prev_total > 0 else 0
                if daily_ret >= 0.05 or daily_ret <= -0.03:
                    reason = f"{'익절' if daily_ret >= 0.05 else '손절'} (총자산 {daily_ret*100:+.2f}%)"
                    for ticker in list(pf.holdings.keys()):
                        if ticker not in prices:
                            continue
                        h = pf.holdings[ticker]
                        price = prices[ticker]["price"]
                        exec_price, fee = pf.calc_fees(ticker, price, h["shares"], "sell")
                        revenue = h["shares"] * exec_price
                        profit = (exec_price - h["avg_price"]) * h["shares"]
                        pf.cash += revenue - fee
                        pf.transactions.append({"type": "sell", "profit": profit, "date": date_str})
                        del pf.holdings[ticker]

            # 스냅샷
            pf.snapshot(date_str, prices)

    print(f"   [100%] 완료!\n")

    # 6. 성과 지표 계산
    results = {}
    for inv_id in investor_ids:
        pf = portfolios[inv_id]
        daily_assets = [(s[0], s[1]) for s in pf.daily_snapshots]
        metrics = compute_metrics(daily_assets, initial_capital, pf.transactions)
        results[inv_id] = {
            "investor_id": inv_id,
            "name": pf.name,
            "strategy": pf.strategy,
            "metrics": metrics,
            "final_asset": daily_assets[-1][1] if daily_assets else initial_capital,
            "snapshots": pf.daily_snapshots,
        }

    # 7. 결과 출력
    _print_results(results, initial_capital)

    # 8. Supabase 저장
    if save_to_db:
        run_id = _save_results(start_date, end_date, trading_days, investor_ids,
                               initial_capital, trading_costs, results)
        print(f"\n💾 결과 저장 완료: backtest_runs/{run_id}")
    else:
        run_id = None

    return {"run_id": run_id, "results": results, "trading_days": len(trading_days)}


def _print_results(results, initial_capital):
    """결과 테이블 출력"""
    # 수익률 순 정렬
    sorted_results = sorted(results.values(),
                            key=lambda r: r["metrics"]["cumulative_return_pct"], reverse=True)

    print(f"{'━' * 75}")
    print(f"{'순위':>4} {'투자자':<12} {'수익률':>8} {'샤프':>6} {'MDD':>8} {'변동성':>8} {'승률':>6}")
    print(f"{'━' * 75}")

    for rank, r in enumerate(sorted_results, 1):
        m = r["metrics"]
        ret = f"{m['cumulative_return_pct']:+.1f}%"
        sharpe = f"{m['sharpe_ratio']:.2f}"
        mdd = f"{m['mdd_pct']:.1f}%"
        vol = f"{m['volatility_pct']:.1f}%"
        win = f"{m['win_rate_pct']:.1f}%"
        name = f"{r['investor_id']} {r['name']}"
        print(f"{rank:>4}  {name:<12} {ret:>8} {sharpe:>6} {mdd:>8} {vol:>8} {win:>6}")

    print(f"{'━' * 75}")

    # 벤치마크(E) 표시
    if "E" in results:
        e_ret = results["E"]["metrics"]["cumulative_return_pct"]
        print(f"벤치마크(E): {e_ret:+.1f}%")


def _save_results(start_date, end_date, trading_days, investor_ids,
                  initial_capital, trading_costs, results):
    """결과를 Supabase에 저장"""
    import sys
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "core"))
    from supabase_client import supabase

    # 요약 rankings
    rankings = []
    for inv_id in sorted(results.keys()):
        r = results[inv_id]
        rankings.append({
            "investor_id": inv_id,
            "name": r["name"],
            "strategy": r["strategy"],
            "final_asset": r["final_asset"],
            **r["metrics"],
        })
    rankings.sort(key=lambda x: x["cumulative_return_pct"], reverse=True)

    # backtest_runs 저장
    run_row = {
        "start_date": start_date,
        "end_date": end_date,
        "trading_days": len(trading_days),
        "investors": investor_ids,
        "parameters": {
            "initial_capital": initial_capital,
            "trading_costs": trading_costs,
        },
        "summary": {"rankings": rankings},
    }

    result = supabase.table("backtest_runs").insert(run_row).execute()
    run_id = result.data[0]["id"]

    # backtest_snapshots 저장 (배치)
    snapshot_rows = []
    for inv_id, r in results.items():
        for date_str, total_asset, cash, holdings in r["snapshots"]:
            # holdings 간소화 (shares + avg_price만)
            h_simple = {}
            for ticker, h in holdings.items():
                h_simple[ticker] = {
                    "name": h["name"],
                    "shares": h["shares"],
                    "avg_price": h["avg_price"],
                }
            snapshot_rows.append({
                "run_id": run_id,
                "investor_id": inv_id,
                "date": date_str,
                "total_asset": total_asset,
                "cash": cash,
                "holdings": h_simple,
            })

    # 1000건씩 배치 삽입
    batch_size = 1000
    for i in range(0, len(snapshot_rows), batch_size):
        batch = snapshot_rows[i:i + batch_size]
        supabase.table("backtest_snapshots").insert(batch).execute()

    print(f"   스냅샷 {len(snapshot_rows)}건 저장")
    return run_id
