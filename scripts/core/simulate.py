"""일일 시뮬레이션 오케스트레이터"""
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "modules"))

from logger import get_logger

logger = get_logger(__name__)

from supabase_client import supabase
from market import get_stock_prices
from portfolio import (
    get_all_investors,
    is_rebalance_due,
    load_portfolio,
    load_profile,
    rebalance,
    evaluate,
    check_target_prices,
    merge_allocation_with_holdings,
    save_portfolio,
    calc_fees,
)
from daily_pipeline import save_snapshots


def _save_snapshots_from_report(report, date_str):
    """리포트의 investor_details에서 스냅샷 데이터를 추출하여 저장"""
    investors = get_all_investors()
    profiles = {inv_id: load_profile(inv_id) for inv_id in investors}
    name_to_id = {p["name"]: inv_id for inv_id, p in profiles.items()}

    snapshot_rows = []
    for name, detail in report["investor_details"].items():
        inv_id = name_to_id.get(name)
        if not inv_id:
            continue
        snapshot_rows.append({
            "investor_id": inv_id,
            "holdings": detail.get("holdings", {}),
            "cash": detail.get("cash", 0),
            "total_asset": detail.get("total_asset", 0),
        })
    save_snapshots(date_str, snapshot_rows)


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

    logger.info(f"\n{'='*60}")
    logger.info(f" 시뮬레이션 실행: {date_str}")
    logger.info(f"{'='*60}")

    # 1. 현재 주가 조회
    logger.info(f"\n [주가 조회 중...]")
    current_prices = get_stock_prices(price_type="open")
    if not current_prices:
        logger.error("주가 조회 실패")
        return None
    for ticker, data in current_prices.items():
        logger.debug(f"  {data['name']}: {data['price']:,}원 ({'+' if data['change_pct'] >= 0 else ''}{data['change_pct']:.2f}%)")

    # 2. 각 투자자별 리밸런싱
    investors = get_all_investors()
    rebalance_results = {}

    logger.info(f"\n [리밸런싱 체크]")
    for inv_id in sorted(investors):
        profile = load_profile(inv_id)
        due = is_rebalance_due(inv_id, date_str)
        freq = profile["rebalance_frequency_days"]

        if not due:
            logger.info(f"  {profile['name']} ({profile['strategy']}, 빈도: {freq}일) → 스킵")
            rebalance_results[inv_id] = {"rebalanced": False, "trades": []}
            continue

        # 투자자별 개별 allocation 로드
        alloc_data = load_investor_allocation(inv_id, date_str)
        if alloc_data is None:
            logger.info(f"  {profile['name']} ({profile['strategy']}, 빈도: {freq}일) → 배분 없음 (스킵)")
            rebalance_results[inv_id] = {"rebalanced": False, "trades": []}
            continue

        allocation = alloc_data["allocation"]

        # L/O: 기존 보유종목을 현재 비중으로 병합 (신규 진입만 allocation 패턴)
        if inv_id in ("L", "O", "P"):
            portfolio_now = load_portfolio(inv_id)
            if portfolio_now.get("holdings"):
                allocation = merge_allocation_with_holdings(
                    allocation, portfolio_now["holdings"], current_prices, portfolio_now["cash"]
                )

        logger.info(f"  {profile['name']} ({profile['strategy']}, 빈도: {freq}일) → 실행")
        for ticker, pct in allocation.items():
            logger.debug(f"    목표: {ticker} {pct*100:.1f}%")

        trades = rebalance(inv_id, allocation, current_prices, date_str)
        if trades:
            for t in trades:
                logger.info(f"    {t['type'].upper()} {t['ticker']} {t['shares']}주 @ {t['price']:,}원")
        else:
            logger.info(f"    변경 없음 (이미 목표 배분과 일치)")

        rebalance_results[inv_id] = {"rebalanced": True, "trades": trades}

    # 2.5 L 신장모: 목표가/손절 체크 (리밸런싱과 별개로 매일 실행)
    if "L" in investors:
        # 레짐별 분할매도 threshold 동적 조정
        regime_row = supabase.table("market_regimes").select("regime").eq("date", date_str).execute().data
        l_regime = regime_row[0]["regime"] if regime_row else "neutral"
        tranches_by_regime = {
            "bull":    [{"threshold": 0.15, "sell_ratio": 1/3}, {"threshold": 0.30, "sell_ratio": 0.5}, {"threshold": 0.50, "sell_ratio": 1.0}],
            "neutral": [{"threshold": 0.10, "sell_ratio": 1/3}, {"threshold": 0.20, "sell_ratio": 0.5}, {"threshold": 0.35, "sell_ratio": 1.0}],
            "bear":    [{"threshold": 0.07, "sell_ratio": 1/3}, {"threshold": 0.12, "sell_ratio": 0.5}, {"threshold": 0.20, "sell_ratio": 1.0}],
        }
        l_tranches = tranches_by_regime.get(l_regime, tranches_by_regime["neutral"])
        target_trades = check_target_prices("L", current_prices, date_str,
                                             sell_tranches=l_tranches, stop_loss=-0.07)
        if target_trades:
            if "L" not in rebalance_results:
                rebalance_results["L"] = {"rebalanced": False, "trades": []}
            rebalance_results["L"]["trades"].extend(target_trades)
            rebalance_results["L"]["rebalanced"] = True
            for t in target_trades:
                logger.info(f"    [신장모 목표가] {t['type'].upper()} {t['ticker']} {t['shares']}주 @ {t['price']:,}원 ({t.get('reason', '')})")

    # 2.6 O 정익절: 익절(총자산 +5% → 전 종목) + 손절(종목별 -3%)
    # 오늘 날짜: 장중 모니터링(o_monitor.py)이 담당하므로 스킵
    # 과거 날짜: 시뮬레이션에서 일괄 체크
    if "O" in investors:
        from datetime import date as date_cls
        is_past = date_str < date_cls.today().isoformat()
        if is_past:
            portfolio_o = load_portfolio("O")
            holdings_o = portfolio_o.get("holdings", {})
            if holdings_o:
                all_trades = []

                # 1) 종목별 손절 (-3%)
                stop_trades = check_target_prices(
                    "O", current_prices, date_str,
                    sell_tranches=[],  # 분할매도 없음
                    stop_loss=-0.03,
                )
                if stop_trades:
                    all_trades.extend(stop_trades)
                    # 손절 후 포트폴리오 재로드
                    portfolio_o = load_portfolio("O")
                    holdings_o = portfolio_o.get("holdings", {})

                # 2) 총자산 익절 (+5%)
                if holdings_o:
                    prev_snap = (
                        supabase.table("portfolio_snapshots")
                        .select("total_asset")
                        .eq("investor_id", "O")
                        .lt("date", date_str)
                        .order("date", desc=True)
                        .limit(1)
                        .execute()
                        .data
                    )
                    prev_total = prev_snap[0]["total_asset"] if prev_snap else 5_000_000
                    eval_amount = sum(
                        holdings_o[t]["shares"] * current_prices[t]["price"]
                        for t in holdings_o if t in current_prices
                    )
                    current_total = portfolio_o["cash"] + eval_amount
                    daily_return_pct = (current_total / prev_total - 1) if prev_total > 0 else 0

                    if daily_return_pct >= 0.05:
                        from o_monitor import sell_all_holdings
                        profit_trades = sell_all_holdings(portfolio_o, current_prices, date_str,
                                                          f"익절 (총자산 {daily_return_pct*100:+.2f}%)")
                        all_trades.extend(profit_trades)

                if all_trades:
                    if "O" not in rebalance_results:
                        rebalance_results["O"] = {"rebalanced": False, "trades": []}
                    rebalance_results["O"]["trades"].extend(all_trades)
                    rebalance_results["O"]["rebalanced"] = True
                    for t in all_trades:
                        logger.info(f"    [정익절] {t['type'].upper()} {t['ticker']} {t['shares']}주 @ {t['price']:,}원 ({t.get('reason', '')})")

    # 2.7 P 정삼절: O와 동일 규칙, baseline 고정 (500만원)
    # 오늘 날짜: 장중 모니터링(p_monitor.py)이 담당하므로 스킵
    # 과거 날짜: 시뮬레이션에서 일괄 체크
    if "P" in investors:
        from datetime import date as date_cls
        is_past = date_str < date_cls.today().isoformat()
        if is_past:
            portfolio_p = load_portfolio("P")
            holdings_p = portfolio_p.get("holdings", {})
            if holdings_p:
                all_trades = []

                # 1) 종목별 손절 (-3%)
                stop_trades = check_target_prices(
                    "P", current_prices, date_str,
                    sell_tranches=[],
                    stop_loss=-0.03,
                )
                if stop_trades:
                    all_trades.extend(stop_trades)
                    portfolio_p = load_portfolio("P")
                    holdings_p = portfolio_p.get("holdings", {})

                # 2) 총자산 익절 (baseline 500만원 대비 +5%)
                if holdings_p:
                    prev_total = 5_000_000  # P는 항상 baseline 기준
                    eval_amount = sum(
                        holdings_p[t]["shares"] * current_prices[t]["price"]
                        for t in holdings_p if t in current_prices
                    )
                    current_total = portfolio_p["cash"] + eval_amount
                    daily_return_pct = (current_total / prev_total - 1) if prev_total > 0 else 0

                    if daily_return_pct >= 0.05:
                        from p_monitor import sell_all_holdings as p_sell_all
                        profit_trades = p_sell_all(portfolio_p, current_prices, date_str,
                                                    f"익절 (baseline 대비 {daily_return_pct*100:+.2f}%)")
                        all_trades.extend(profit_trades)

                if all_trades:
                    if "P" not in rebalance_results:
                        rebalance_results["P"] = {"rebalanced": False, "trades": []}
                    rebalance_results["P"]["trades"].extend(all_trades)
                    rebalance_results["P"]["rebalanced"] = True
                    for t in all_trades:
                        logger.info(f"    [정삼절] {t['type'].upper()} {t['ticker']} {t['shares']}주 @ {t['price']:,}원 ({t.get('reason', '')})")

    # 3. 포트폴리오 평가
    logger.info(f"\n [포트폴리오 평가]")
    for inv_id in sorted(investors):
        profile = load_profile(inv_id)
        portfolio = load_portfolio(inv_id)
        result = evaluate(inv_id, current_prices)
        sign = "+" if result["total_return"] >= 0 else ""
        logger.info(f"  {result['investor']} ({profile['strategy']}): 총자산 {result['total_asset']:,}원 ({sign}{result['total_return_pct']:.2f}%)")

    # 4. 일간 리포트 생성
    report = generate_daily_report_with_rebalance(current_prices, date_str, rebalance_results)

    # 5. 포트폴리오 스냅샷 저장
    _save_snapshots_from_report(report, date_str)

    logger.info(f"\n 리포트 저장 완료: daily_reports/{date_str}")

    # 6. 이벤트 감지 & 알림
    try:
        from event_detector import detect_and_alert
        detect_and_alert(date_str)
    except Exception as e:
        logger.warning(f"이벤트 감지 실패 (무시): {e}")

    # 7. 리스크 관리 체크
    try:
        from risk_manager import check_risk_limits
        risk_events = check_risk_limits(date_str)
        if risk_events:
            logger.info(f"리스크 이벤트 {len(risk_events)}건 감지")
    except Exception as e:
        logger.warning(f"리스크 체크 실패 (무시): {e}")

    # 8. 마켓 레짐 저장
    try:
        from market_regime import get_market_regime
        regime_data = get_market_regime()
        from daily_pipeline import save_market_regime
        save_market_regime(date_str, regime_data)
    except Exception as e:
        logger.warning(f"레짐 저장 실패 (무시): {e}")

    logger.info(f"{'='*60}\n")

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

    logger.info(f"\n{'='*60}")
    logger.info(f" 종가 업데이트: {date_str}")
    logger.info(f"{'='*60}")

    # 기존 리포트 로드
    existing = supabase.table("daily_reports").select("*").eq("date", date_str).execute().data
    if not existing:
        logger.error("해당 날짜의 리포트가 없습니다")
        return None

    prev_report = existing[0]

    # 종가 조회
    logger.info(f"\n [종가 조회 중...]")
    closing_prices = get_stock_prices(price_type="close")
    if not closing_prices:
        logger.error("종가 조회 실패")
        return None

    for ticker, data in closing_prices.items():
        logger.debug(f"  {data['name']}: {data['price']:,}원 ({'+' if data['change_pct'] >= 0 else ''}{data['change_pct']:.2f}%)")

    # 종가 기준으로 포트폴리오 재평가
    investors = get_all_investors()
    results = []

    logger.info(f"\n [종가 기준 재평가]")
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
        logger.info(f"  {result['investor']}: {result['total_asset']:,}원 ({sign}{result['total_return_pct']:.2f}%)")

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

    # 종가 기준 스냅샷 갱신
    _save_snapshots_from_report(report, date_str)

    # P 정삼절: 장마감 정산 (보유종목 강제 청산 + baseline 리셋)
    if "P" in investors:
        _settle_p_baseline(date_str, closing_prices)

    # Q 정채원: 미청산 보유종목 강제 매도 (스캘핑 미체결분 안전망)
    if "Q" in investors:
        _settle_q_holdings(date_str, closing_prices)

    logger.info(f"\n 종가 반영 완료: daily_reports/{date_str}")
    logger.info(f"{'='*60}\n")

    return report


def _settle_p_baseline(date_str, closing_prices):
    """P 정삼절 장마감 정산: 보유종목 강제 청산 → cashflow_account 정산 → baseline 리셋"""
    BASELINE = 5_000_000
    portfolio_p = load_portfolio("P")
    holdings_p = portfolio_p.get("holdings", {})

    # 총 평가액 계산
    eval_amount = sum(
        holdings_p[t]["shares"] * closing_prices[t]["price"]
        for t in holdings_p if t in closing_prices
    )
    total_value = portfolio_p["cash"] + eval_amount

    # 손익 정산
    pnl = total_value - BASELINE
    cashflow = portfolio_p.get("cashflow_account", 0) + pnl

    # 보유종목 강제 매도 (종가 기준 — 거래 기록만, 이미 evaluate 반영됨)
    if holdings_p:
        pending_transactions = []
        for ticker in list(holdings_p.keys()):
            if ticker not in closing_prices:
                continue
            h = holdings_p[ticker]
            price = closing_prices[ticker]["price"]
            exec_price, fee = calc_fees(ticker, price, h["shares"], "sell")
            revenue = h["shares"] * exec_price
            profit = (exec_price - h["avg_price"]) * h["shares"]
            pending_transactions.append({
                "investor_id": "P", "date": date_str, "type": "sell",
                "ticker": ticker, "name": h["name"], "shares": h["shares"],
                "price": exec_price, "amount": revenue, "fee": fee, "profit": profit,
            })
        if pending_transactions:
            supabase.table("transactions").insert(pending_transactions).execute()

    # Baseline 리셋
    portfolio_p["cash"] = BASELINE
    portfolio_p["holdings"] = {}
    portfolio_p["cashflow_account"] = cashflow
    save_portfolio("P", portfolio_p)

    # 스냅샷 갱신 (total_asset = baseline + cashflow)
    total_asset = BASELINE + cashflow
    snapshot_data = {
        "investor_id": "P",
        "date": date_str,
        "holdings": {},
        "cash": BASELINE,
        "total_asset": total_asset,
        "snapshot_at": datetime.now().isoformat(),
        "cashflow_account": cashflow,
    }
    supabase.table("portfolio_snapshots").upsert(snapshot_data).execute()

    # daily_reports의 P 데이터도 정산 후 자산으로 갱신
    existing = supabase.table("daily_reports").select("*").eq("date", date_str).execute().data
    if existing:
        report = existing[0]
        p_name = "정삼절"
        if p_name in report["investor_details"]:
            report["investor_details"][p_name]["total_asset"] = total_asset
            report["investor_details"][p_name]["total_return"] = total_asset - BASELINE
            report["investor_details"][p_name]["total_return_pct"] = round((total_asset / BASELINE - 1) * 100, 2)
            report["investor_details"][p_name]["cash_ratio"] = 100.0
            report["investor_details"][p_name]["num_holdings"] = 0

            # rankings 재정렬
            details = list(report["investor_details"].values())
            details.sort(key=lambda x: x.get("total_return_pct", 0), reverse=True)
            rankings = [
                {
                    "rank": i + 1,
                    "investor": d["investor"],
                    "strategy": d["strategy"],
                    "total_asset": d["total_asset"],
                    "total_return": d["total_return"],
                    "total_return_pct": d["total_return_pct"],
                    "num_holdings": d["num_holdings"],
                    "cash_ratio": d["cash_ratio"],
                    "rebalance_frequency_days": d.get("rebalance_frequency_days", 1),
                    "rebalanced_today": d.get("rebalanced_today", False),
                    "total_rebalances": d.get("total_rebalances", 0),
                }
                for i, d in enumerate(details)
            ]
            supabase.table("daily_reports").upsert({
                "date": date_str,
                "generated_at": report["generated_at"],
                "market_prices": report["market_prices"],
                "rankings": rankings,
                "investor_details": report["investor_details"],
            }).execute()

    logger.info(f"  [정삼절] 장마감 정산: PnL {pnl:+,}원, cashflow {cashflow:,}원, total_asset {total_asset:,}원")


def _settle_q_holdings(date_str, closing_prices):
    """Q 정채원 장마감 정산: q_monitor가 청산하지 못한 보유종목을 종가 기준 강제 매도.

    Q는 stock_universe 밖 종목을 매매할 수 있으므로 closing_prices에 없는 ticker는
    yfinance로 단건 조회한다. 종가 조회 실패 시 매수 평단으로 청산하여 PnL 0 처리.
    """
    portfolio_q = load_portfolio("Q")
    holdings_q = portfolio_q.get("holdings", {})
    if not holdings_q:
        return  # 정상 청산됨

    import yfinance as yf

    pending = []
    for ticker in list(holdings_q.keys()):
        h = holdings_q[ticker]
        if ticker in closing_prices:
            price = closing_prices[ticker]["price"]
        else:
            try:
                hist = yf.Ticker(ticker).history(period="1d")
                price = int(hist["Close"].iloc[-1]) if not hist.empty else h["avg_price"]
            except Exception:
                price = h["avg_price"]
        if price <= 0:
            price = h["avg_price"]

        exec_price, fee = calc_fees(ticker, price, h["shares"], "sell")
        revenue = h["shares"] * exec_price
        profit = (exec_price - h["avg_price"]) * h["shares"]
        portfolio_q["cash"] += revenue - fee
        del portfolio_q["holdings"][ticker]
        pending.append({
            "investor_id": "Q", "date": date_str, "type": "sell",
            "ticker": ticker, "name": h["name"], "shares": h["shares"],
            "price": exec_price, "amount": revenue, "fee": fee, "profit": profit,
        })

    if not pending:
        return

    supabase.table("transactions").insert(pending).execute()
    save_portfolio("Q", portfolio_q)

    # daily_reports의 Q 데이터 갱신 + rankings 재정렬
    total_asset = portfolio_q["cash"]
    initial = 5_000_000
    existing = supabase.table("daily_reports").select("*").eq("date", date_str).execute().data
    if existing:
        report = existing[0]
        q_name = "정채원"
        if q_name in report["investor_details"]:
            d = report["investor_details"][q_name]
            d["total_asset"] = total_asset
            d["holdings"] = {}
            d["holdings_value"] = 0
            d["num_holdings"] = 0
            d["cash"] = portfolio_q["cash"]
            d["cash_ratio"] = 100.0
            d["total_return"] = total_asset - initial
            d["total_return_pct"] = round((total_asset / initial - 1) * 100, 2)

            details = list(report["investor_details"].values())
            details.sort(key=lambda x: x.get("total_return_pct", 0), reverse=True)
            rankings = [
                {
                    "rank": i + 1,
                    "investor": d2["investor"],
                    "strategy": d2["strategy"],
                    "total_asset": d2["total_asset"],
                    "total_return": d2["total_return"],
                    "total_return_pct": d2["total_return_pct"],
                    "num_holdings": d2["num_holdings"],
                    "cash_ratio": d2["cash_ratio"],
                    "rebalance_frequency_days": d2.get("rebalance_frequency_days", 1),
                    "rebalanced_today": d2.get("rebalanced_today", False),
                    "total_rebalances": d2.get("total_rebalances", 0),
                }
                for i, d2 in enumerate(details)
            ]
            supabase.table("daily_reports").upsert({
                "date": date_str,
                "generated_at": report["generated_at"],
                "market_prices": report["market_prices"],
                "rankings": rankings,
                "investor_details": report["investor_details"],
            }).execute()

    supabase.table("portfolio_snapshots").upsert({
        "investor_id": "Q",
        "date": date_str,
        "holdings": {},
        "cash": portfolio_q["cash"],
        "total_asset": total_asset,
        "snapshot_at": datetime.now().isoformat(),
    }).execute()

    logger.info(f"  [정채원] 장마감 정산: 미청산 {len(pending)}건 강제 매도, total_asset {total_asset:,}원")


if __name__ == "__main__":
    target_date = sys.argv[1] if len(sys.argv) > 1 else None
    if len(sys.argv) > 2 and sys.argv[2] == "--close":
        update_closing_prices(target_date)
    else:
        run_simulation(target_date)
