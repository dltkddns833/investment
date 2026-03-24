"""메타 매니저 — 14명 시뮬레이션 데이터를 종합하여 실전 배분 결정

일일 파이프라인:
  1. 데이터 수집 (Supabase + KIS API)
  2. 정량 분석 (스코어카드, 레짐, 모멘텀, 상관관계)
  3. Claude에게 분석 결과 전달 → 최적 배분 결정
  4. 텔레그램 승인 → KIS API 체결
"""
import sys
import json
import math
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "notifications"))

from supabase_client import supabase
from broker_client import KISClient, yf_to_kis, kis_to_yf
from scorecard import compute_scorecards
from safety import (
    check_daily_loss, check_cumulative_loss, check_kill_switch,
    validate_meta_allocation, is_trading_hours, emergency_liquidate,
    get_prev_real_portfolio,
)
from send_telegram import send_telegram, send_approval_request, wait_for_approval
from logger import get_logger

logger = get_logger(__name__)

INITIAL_CAPITAL = 2_000_000  # 실전 초기 자금


def notify(message):
    """텔레그램 알림 (실패 무시)"""
    try:
        send_telegram(message)
    except Exception as e:
        logger.warning(f"텔레그램 알림 실패 (무시): {e}")


class MetaManager:
    """메타 매니저 — 실전 투자 의사결정 엔진"""

    def __init__(self, date_str=None):
        self.kis = KISClient()
        self.date_str = date_str or datetime.now().strftime("%Y-%m-%d")

    # ─── Step 1: 데이터 수집 ─────────────────────────

    def collect_data(self):
        """Supabase + KIS에서 분석에 필요한 모든 데이터 수집"""
        data = {}

        # 마켓 레짐
        regime_rows = (
            supabase.table("market_regimes")
            .select("date, regime, bull_score, kospi_price")
            .order("date", desc=True)
            .limit(1)
            .execute()
            .data
        )
        data["market_regime"] = regime_rows[0] if regime_rows else {"regime": "neutral", "bull_score": 0}

        # KIS 시장 요약
        try:
            data["morning_session"] = self.kis.get_market_summary()
        except Exception as e:
            logger.warning(f"KIS 시장 요약 조회 실패: {e}")
            data["morning_session"] = {}

        # 최근 daily_reports (최근 5일)
        reports = (
            supabase.table("daily_reports")
            .select("date, rankings, investor_details")
            .order("date", desc=True)
            .limit(5)
            .execute()
            .data
        )
        data["daily_reports"] = reports

        # 최근 30일 portfolio_snapshots
        cutoff = (datetime.strptime(self.date_str, "%Y-%m-%d") - timedelta(days=45)).strftime("%Y-%m-%d")
        snapshots = (
            supabase.table("portfolio_snapshots")
            .select("investor_id, date, total_asset")
            .gte("date", cutoff)
            .order("date")
            .execute()
            .data
        )
        data["snapshots"] = snapshots

        # 리스크 이벤트 (최근 7일)
        risk_cutoff = (datetime.strptime(self.date_str, "%Y-%m-%d") - timedelta(days=7)).strftime("%Y-%m-%d")
        risk_events = (
            supabase.table("risk_events")
            .select("date, investor_id, event_type, severity")
            .gte("date", risk_cutoff)
            .order("date", desc=True)
            .execute()
            .data
        )
        data["risk_events"] = risk_events

        # 프로필
        profiles = supabase.table("profiles").select("id, name, strategy").execute().data
        data["profiles"] = profiles

        # 실전 포트폴리오 (전일)
        data["prev_real_portfolio"] = get_prev_real_portfolio()

        # KIS 현재 보유종목
        try:
            data["current_holdings"] = self.kis.get_holdings()
        except Exception as e:
            logger.warning(f"KIS 보유종목 조회 실패: {e}")
            data["current_holdings"] = []

        # KIS 예수금
        try:
            data["balance"] = self.kis.get_balance()
        except Exception as e:
            logger.warning(f"KIS 예수금 조회 실패: {e}")
            data["balance"] = {"cash": 0, "total_eval": 0}

        return data

    # ─── Step 2: 정량 분석 ─────────────────────────

    def analyze(self, data):
        """Python 기반 정량 분석"""
        analysis = {}

        # 스코어카드
        try:
            scorecards = compute_scorecards()
            analysis["scorecards"] = scorecards
        except Exception as e:
            logger.error(f"스코어카드 계산 실패: {e}")
            analysis["scorecards"] = []

        # 레짐
        analysis["regime"] = data["market_regime"]

        # 최근 5일 모멘텀 (투자자별 수익률)
        analysis["recent_momentum"] = self._compute_recent_momentum(data["snapshots"])

        # 레짐별 최적 전략
        analysis["regime_optimal"] = self._compute_regime_optimal(data["snapshots"])

        # 포지션 겹침률
        if data["daily_reports"]:
            latest = data["daily_reports"][0]
            analysis["position_overlap"] = self._compute_overlap(latest.get("investor_details", {}))
        else:
            analysis["position_overlap"] = {}

        # 리스크 이벤트 요약
        risk_by_investor = defaultdict(list)
        for ev in data.get("risk_events", []):
            risk_by_investor[ev["investor_id"]].append(ev["event_type"])
        analysis["risk_flags"] = dict(risk_by_investor)

        # 현재 실전 포트폴리오
        analysis["current_holdings"] = data.get("current_holdings", [])
        analysis["balance"] = data.get("balance", {})
        analysis["morning_session"] = data.get("morning_session", {})

        return analysis

    def _compute_recent_momentum(self, snapshots):
        """최근 5영업일 투자자별 수익률"""
        investor_assets = defaultdict(list)
        for s in snapshots:
            investor_assets[s["investor_id"]].append((s["date"], s["total_asset"]))

        momentum = {}
        for inv_id, assets in investor_assets.items():
            assets.sort(key=lambda x: x[0])
            if len(assets) >= 6:
                recent = assets[-1][1]
                prev = assets[-6][1]
                if prev > 0:
                    momentum[inv_id] = round((recent / prev - 1) * 100, 2)
        return dict(sorted(momentum.items(), key=lambda x: -x[1]))

    def _compute_regime_optimal(self, snapshots):
        """레짐별 최적 투자자 (상위 3명씩)"""
        # 레짐 데이터 로드
        regimes = (
            supabase.table("market_regimes")
            .select("date, regime")
            .order("date")
            .execute()
            .data
        )
        regime_map = {r["date"]: r["regime"] for r in regimes}

        # 투자자별 자산 시계열
        investor_assets = defaultdict(dict)
        for s in snapshots:
            investor_assets[s["investor_id"]][s["date"]] = s["total_asset"]

        # 레짐별 수익률 집계
        regime_returns = defaultdict(lambda: defaultdict(list))  # regime → inv_id → [daily_return]
        dates = sorted(set(s["date"] for s in snapshots))

        for i in range(1, len(dates)):
            date = dates[i]
            prev_date = dates[i - 1]
            regime = regime_map.get(date, "neutral")

            for inv_id, assets_by_date in investor_assets.items():
                curr = assets_by_date.get(date)
                prev = assets_by_date.get(prev_date)
                if curr and prev and prev > 0:
                    regime_returns[regime][inv_id].append(curr / prev - 1)

        # 레짐별 평균 수익률 → 상위 3명
        optimal = {}
        for regime in ["bull", "neutral", "bear"]:
            inv_returns = {}
            for inv_id, returns in regime_returns.get(regime, {}).items():
                if returns:
                    inv_returns[inv_id] = sum(returns) / len(returns) * 100
            top3 = sorted(inv_returns.items(), key=lambda x: -x[1])[:3]
            optimal[regime] = [{"investorId": inv_id, "avgReturnPct": round(ret, 3)} for inv_id, ret in top3]

        return optimal

    def _compute_overlap(self, investor_details):
        """포지션 겹침률 (Jaccard similarity) — 상위 겹침 쌍만"""
        holdings_map = {}
        for name, detail in investor_details.items():
            tickers = set(detail.get("holdings", {}).keys())
            if tickers:
                holdings_map[name] = tickers

        overlaps = []
        names = list(holdings_map.keys())
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                a, b = holdings_map[names[i]], holdings_map[names[j]]
                union = len(a | b)
                if union > 0:
                    jaccard = len(a & b) / union
                    if jaccard > 0.3:
                        overlaps.append({
                            "pair": f"{names[i]}-{names[j]}",
                            "jaccard": round(jaccard, 2),
                        })
        overlaps.sort(key=lambda x: -x["jaccard"])
        return overlaps[:10]

    # ─── Step 3: Claude용 분석 포맷 ─────────────────

    def format_analysis_for_claude(self, analysis):
        """분석 결과를 Claude에게 전달할 구조화 텍스트로 포맷"""
        lines = []
        lines.append(f"# 메타 매니저 분석 리포트 ({self.date_str})\n")

        # 시장 상황
        regime = analysis.get("regime", {})
        morning = analysis.get("morning_session", {})
        lines.append("## 시장 상황")
        lines.append(f"- 마켓 레짐: {regime.get('regime', 'unknown')} (bull_score: {regime.get('bull_score', 'N/A')})")
        if morning:
            lines.append(f"- KOSPI: {morning.get('kospi_price', 'N/A')} ({morning.get('kospi_change_pct', 0):+.2f}%)")
        lines.append("")

        # 스코어카드 상위 5명
        scorecards = analysis.get("scorecards", [])
        if scorecards:
            lines.append("## 전략 스코어카드 (상위 5명)")
            for sc in scorecards[:5]:
                rec = " ⭐추천" if sc["recommended"] else ""
                cats = sc["categories"]
                lines.append(
                    f"- #{sc['rank']} {sc['investor']}({sc['investorId']}): "
                    f"총점 {sc['totalScore']} | "
                    f"수익 {cats['profitability']['score']:.0f} · "
                    f"위험조정 {cats['riskAdjusted']['score']:.0f} · "
                    f"방어 {cats['defense']['score']:.0f} · "
                    f"일관 {cats['consistency']['score']:.0f}{rec}"
                )
            lines.append("")

        # 레짐별 최적 전략
        optimal = analysis.get("regime_optimal", {})
        if optimal:
            lines.append("## 레짐별 최적 전략")
            for regime_name in ["bull", "neutral", "bear"]:
                top = optimal.get(regime_name, [])
                top_str = ", ".join(f"{t['investorId']}({t['avgReturnPct']:+.3f}%)" for t in top)
                lines.append(f"- {regime_name}: {top_str}")
            lines.append("")

        # 최근 5일 모멘텀
        momentum = analysis.get("recent_momentum", {})
        if momentum:
            lines.append("## 최근 5일 모멘텀")
            for inv_id, pct in list(momentum.items())[:5]:
                lines.append(f"- {inv_id}: {pct:+.2f}%")
            lines.append("")

        # 리스크 플래그
        risk_flags = analysis.get("risk_flags", {})
        if risk_flags:
            lines.append("## 리스크 플래그 (최근 7일)")
            for inv_id, events in risk_flags.items():
                lines.append(f"- {inv_id}: {', '.join(events)}")
            lines.append("")

        # 포지션 겹침
        overlap = analysis.get("position_overlap", [])
        if overlap:
            lines.append("## 포지션 높은 겹침률 (Jaccard > 0.3)")
            for o in overlap[:5]:
                lines.append(f"- {o['pair']}: {o['jaccard']}")
            lines.append("")

        # 현재 실전 포트폴리오
        balance = analysis.get("balance", {})
        holdings = analysis.get("current_holdings", [])
        lines.append("## 현재 실전 포트폴리오")
        lines.append(f"- 예수금: {balance.get('cash', 0):,}원")
        if holdings:
            for h in holdings:
                lines.append(
                    f"- {h['name']}({h['ticker']}): {h['shares']}주 "
                    f"@ {h['avg_price']:,}원 → {h['current_price']:,}원 "
                    f"({h['profit_pct']:+.1f}%)"
                )
        else:
            lines.append("- 보유종목 없음")
        lines.append("")

        lines.append("## 요청")
        lines.append("위 분석을 바탕으로 최적 전략 조합과 종목별 비중(allocation)을 결정해주세요.")
        lines.append("형식: {\"ticker\": weight, ...} (weight 합계 ≤ 0.95, ticker는 yfinance 형식)")
        lines.append("함께 rationale(근거)도 작성해주세요.")

        return "\n".join(lines)

    # ─── Step 4: 주문 생성 + 실행 ─────────────────

    def compute_orders(self, target_allocation, current_holdings, total_asset):
        """현재 vs 목표 비교하여 매매 주문 생성 (매도 먼저)

        Args:
            target_allocation: {"005930.KS": 0.15, ...}
            current_holdings: KIS get_holdings() 결과
            total_asset: 총자산 (현금 + 평가액)

        Returns:
            [{"ticker": str, "code": str, "side": str, "qty": int, "price": int}, ...]
        """
        # 현재 보유 매핑
        current_map = {}
        for h in current_holdings:
            current_map[h["ticker"]] = {
                "shares": h["shares"],
                "current_price": h["current_price"],
                "code": h["code"],
                "name": h["name"],
            }

        orders = []

        # 매도 주문 (보유 중이지만 목표에 없거나 축소할 종목)
        for ticker, holding in current_map.items():
            target_weight = target_allocation.get(ticker, 0)
            target_value = int(total_asset * target_weight)
            current_value = holding["shares"] * holding["current_price"]

            if target_weight == 0:
                # 전량 매도
                orders.append({
                    "ticker": ticker,
                    "code": holding["code"],
                    "name": holding["name"],
                    "side": "sell",
                    "qty": holding["shares"],
                    "price": holding["current_price"],
                })
            elif target_value < current_value * 0.9:
                # 10% 이상 축소 시 매도
                sell_value = current_value - target_value
                sell_qty = max(1, sell_value // holding["current_price"])
                if sell_qty > 0 and sell_qty <= holding["shares"]:
                    orders.append({
                        "ticker": ticker,
                        "code": holding["code"],
                        "name": holding["name"],
                        "side": "sell",
                        "qty": sell_qty,
                        "price": holding["current_price"],
                    })

        # 매수 주문 (목표에 있지만 미보유 또는 확대할 종목)
        for ticker, weight in target_allocation.items():
            if weight <= 0:
                continue
            target_value = int(total_asset * weight)
            holding = current_map.get(ticker)
            current_value = holding["shares"] * holding["current_price"] if holding else 0

            if target_value > current_value * 1.1:
                # 10% 이상 확대 시 매수
                buy_value = target_value - current_value
                # 현재가 조회
                name = holding["name"] if holding else ticker
                try:
                    price_info = self.kis.get_current_price(ticker)
                    price = price_info["price"]
                    name = price_info.get("name", name)
                except Exception:
                    price = holding["current_price"] if holding else 0

                if price > 0:
                    buy_qty = buy_value // price
                    if buy_qty > 0:
                        orders.append({
                            "ticker": ticker,
                            "code": yf_to_kis(ticker),
                            "name": name,
                            "side": "buy",
                            "qty": int(buy_qty),
                            "price": price,
                        })

        # 매도 먼저, 매수 나중
        orders.sort(key=lambda o: 0 if o["side"] == "sell" else 1)
        return orders

    def execute_orders(self, orders):
        """KIS API로 주문 실행"""
        results = []
        for order in orders:
            try:
                result = self.kis.place_order(
                    order["code"],
                    order["qty"],
                    price=0,  # 시장가
                    side=order["side"],
                )
                results.append({
                    **order,
                    "order_no": result.get("order_no", ""),
                    "status": "submitted",
                })
                logger.info(f"주문 체결: {order['side']} {order.get('name', order['code'])} x{order['qty']}")
            except Exception as e:
                results.append({
                    **order,
                    "order_no": "",
                    "status": f"failed: {e}",
                })
                logger.error(f"주문 실패: {order['side']} {order.get('name', order['code'])} — {e}")
        return results

    # ─── 저장 ─────────────────────────────────────

    def save_decision(self, decision):
        """meta_decisions 테이블에 저장"""
        row = {
            "date": self.date_str,
            "regime": decision.get("regime", ""),
            "morning_session": decision.get("morning_session"),
            "selected_strategies": decision.get("selected_strategies"),
            "rationale": decision.get("rationale", ""),
            "target_allocation": decision.get("target_allocation"),
            "actual_allocation": decision.get("actual_allocation"),
            "orders": decision.get("orders"),
            "approved": decision.get("approved", False),
            "executed": decision.get("executed", False),
        }
        try:
            supabase.table("meta_decisions").upsert(row).execute()
            logger.info(f"meta_decisions 저장 완료: {self.date_str}")
        except Exception as e:
            logger.error(f"meta_decisions 저장 실패: {e}")

    def save_real_portfolio(self):
        """KIS 잔고 기반 real_portfolio 테이블 저장"""
        try:
            holdings_raw = self.kis.get_holdings()
            balance = self.kis.get_balance()
            cash = balance.get("cash", 0)

            holdings = {}
            total_eval = 0
            for h in holdings_raw:
                holdings[h["ticker"]] = {
                    "shares": h["shares"],
                    "avg_price": h["avg_price"],
                    "name": h["name"],
                }
                total_eval += h["eval_amount"]

            total_asset = cash + total_eval

            # 전일 포트폴리오에서 수익률 계산
            prev = get_prev_real_portfolio()
            daily_return_pct = 0
            cumulative_return_pct = round((total_asset / INITIAL_CAPITAL - 1) * 100, 2)

            if prev and prev.get("total_asset", 0) > 0:
                daily_return_pct = round((total_asset / prev["total_asset"] - 1) * 100, 2)

            # KOSPI 수익률 추적 (market_regimes 테이블 기반)
            kospi_cumulative_pct = None
            alpha_cumulative_pct = None
            try:
                # 첫 real_portfolio 날짜의 KOSPI 가격 기준
                first_row = (
                    supabase.table("real_portfolio")
                    .select("date")
                    .order("date")
                    .limit(1)
                    .execute()
                    .data
                )
                if first_row:
                    start_date = first_row[0]["date"]
                    start_regime = (
                        supabase.table("market_regimes")
                        .select("kospi_price")
                        .eq("date", start_date)
                        .limit(1)
                        .execute()
                        .data
                    )
                    latest_regime = (
                        supabase.table("market_regimes")
                        .select("kospi_price")
                        .order("date", desc=True)
                        .limit(1)
                        .execute()
                        .data
                    )
                    if start_regime and latest_regime:
                        start_kospi = float(start_regime[0]["kospi_price"])
                        latest_kospi = float(latest_regime[0]["kospi_price"])
                        if start_kospi > 0:
                            kospi_cumulative_pct = round((latest_kospi / start_kospi - 1) * 100, 2)
                            alpha_cumulative_pct = round(cumulative_return_pct - kospi_cumulative_pct, 2)
            except Exception as e:
                logger.warning(f"KOSPI 수익률 계산 실패 (무시): {e}")

            row = {
                "date": self.date_str,
                "cash": cash,
                "holdings": holdings,
                "total_asset": total_asset,
                "daily_return_pct": daily_return_pct,
                "cumulative_return_pct": cumulative_return_pct,
                "kospi_cumulative_pct": kospi_cumulative_pct,
                "alpha_cumulative_pct": alpha_cumulative_pct,
            }
            supabase.table("real_portfolio").upsert(row).execute()
            logger.info(f"real_portfolio 저장 완료: {self.date_str} (총자산: {total_asset:,}원, 알파: {alpha_cumulative_pct}%)")
        except Exception as e:
            logger.error(f"real_portfolio 저장 실패: {e}")

    # ─── 메인 파이프라인 ──────────────────────────

    def run(self, dry_run=False):
        """메타 매니저 전체 파이프라인 (Step 1~2)

        Returns:
            {"status": str, "analysis": dict, "analysis_text": str}
            Claude가 analysis_text를 보고 배분을 결정한 뒤 execute_allocation()을 호출한다.
        """
        notify(f"\U0001f916 *메타 매니저 시작* ({self.date_str})")

        # 0. 안전 체크
        if check_kill_switch():
            notify("\U0001f6d1 킬스위치 활성화 — 실행 중단")
            return {"status": "killed"}

        prev = get_prev_real_portfolio()
        if prev:
            # 현재 총자산 추정 (KIS 조회)
            try:
                balance = self.kis.get_balance()
                holdings = self.kis.get_holdings()
                current_total = balance.get("cash", 0) + sum(h["eval_amount"] for h in holdings)
            except Exception:
                current_total = prev.get("total_asset", INITIAL_CAPITAL)

            if check_daily_loss(current_total, prev.get("total_asset", 0)):
                notify("\U0001f534 일일 손실 한도 초과 (-3%) — 자동 중단")
                return {"status": "daily_loss_halt"}

            if check_cumulative_loss(current_total, INITIAL_CAPITAL):
                notify("\U0001f534 누적 손실 한도 초과 (-10%) — 전량 청산 시작")
                holdings = self.kis.get_holdings()
                emergency_liquidate(self.kis, holdings)
                return {"status": "emergency_liquidated"}

        # 1. 데이터 수집
        notify("\U0001f4ca Step 1: 데이터 수집")
        data = self.collect_data()

        # 2. 분석
        notify("\U0001f9e0 Step 2: 정량 분석")
        analysis = self.analyze(data)

        # 3. Claude용 포맷
        analysis_text = self.format_analysis_for_claude(analysis)

        notify("\u2705 분석 완료 — Claude의 배분 결정을 기다립니다")

        # regime과 morning_session을 반환하여 execute_allocation()에 전달 가능하게
        regime_str = analysis.get("regime", {}).get("regime", "") if isinstance(analysis.get("regime"), dict) else ""
        morning = analysis.get("morning_session")

        return {
            "status": "awaiting_decision",
            "analysis": analysis,
            "analysis_text": analysis_text,
            "regime": regime_str,
            "morning_session": morning,
        }

    def execute_allocation(self, target_allocation, rationale, selected_strategies=None,
                           regime="", morning_session=None, dry_run=False):
        """Claude가 결정한 배분을 실행

        Args:
            target_allocation: {"005930.KS": 0.15, ...}
            rationale: 배분 근거 텍스트
            selected_strategies: {"B": 0.4, "K": 0.3, "J": 0.3} 등
            regime: 현재 마켓 레짐 (bull/neutral/bear)
            morning_session: 오전장 시장 데이터 (KOSPI, 수급 등)
            dry_run: True이면 분석만, 주문 스킵

        Returns:
            {"status": str, "orders": list}
        """
        # 1. 배분 검증
        adjusted, violations = validate_meta_allocation(target_allocation)
        if violations:
            notify(f"\u26a0\ufe0f 배분 검증 위반 {len(violations)}건:\n" +
                   "\n".join(f"- {v['detail']}" for v in violations))

        # 2. 주문 생성
        current_holdings = self.kis.get_holdings()
        balance = self.kis.get_balance()
        total_eval = sum(h["eval_amount"] for h in current_holdings)
        total_asset = balance.get("cash", 0) + total_eval

        orders = self.compute_orders(adjusted, current_holdings, total_asset)

        if not orders:
            notify("\u2139\ufe0f 리밸런싱 불필요 — 현재 포지션이 목표와 유사합니다")
            self.save_decision({
                "regime": regime,
                "morning_session": morning_session,
                "selected_strategies": selected_strategies,
                "rationale": rationale,
                "target_allocation": adjusted,
                "approved": True,
                "executed": True,
                "orders": [],
            })
            return {"status": "no_orders", "orders": []}

        # 3. 주문 요약 + 텔레그램 승인
        order_lines = []
        for o in orders:
            emoji = "\U0001f534" if o["side"] == "sell" else "\U0001f7e2"
            side_kr = "매도" if o["side"] == "sell" else "매수"
            order_lines.append(
                f"{emoji} {side_kr} {o.get('name', o['code'])} x{o['qty']} "
                f"(~{o['qty'] * o['price']:,}원)"
            )

        msg = (
            f"\U0001f4cb *메타 매니저 주문 확인* ({self.date_str})\n\n"
            f"{chr(10).join(order_lines)}\n\n"
            f"*근거:* {rationale[:200]}"
        )

        if dry_run:
            notify(f"\U0001f527 [드라이런] 주문 {len(orders)}건 생성 (실행 스킵)\n\n" +
                   "\n".join(order_lines))
            self.save_decision({
                "regime": regime,
                "morning_session": morning_session,
                "selected_strategies": selected_strategies,
                "rationale": rationale,
                "target_allocation": adjusted,
                "orders": orders,
                "approved": False,
                "executed": False,
            })
            return {"status": "dry_run", "orders": orders}

        # 장 운영시간 체크
        if not is_trading_hours():
            notify("\u23f0 장 운영시간 외 — 주문 불가 (09:00~15:20)")
            self.save_decision({
                "regime": regime,
                "morning_session": morning_session,
                "selected_strategies": selected_strategies,
                "rationale": rationale,
                "target_allocation": adjusted,
                "orders": orders,
                "approved": False,
                "executed": False,
            })
            return {"status": "market_closed", "orders": orders}

        # 승인 요청
        send_approval_request(msg, self.date_str)
        approved = wait_for_approval(self.date_str, timeout_sec=300)

        if not approved:
            notify("\u274c 주문 거부/타임아웃")
            self.save_decision({
                "regime": regime,
                "morning_session": morning_session,
                "selected_strategies": selected_strategies,
                "rationale": rationale,
                "target_allocation": adjusted,
                "orders": orders,
                "approved": False,
                "executed": False,
            })
            return {"status": "rejected", "orders": orders}

        # 4. 주문 실행
        notify("\u26a1 주문 실행 중...")
        results = self.execute_orders(orders)

        # 5. 저장
        self.save_decision({
            "regime": regime,
            "morning_session": morning_session,
            "selected_strategies": selected_strategies,
            "rationale": rationale,
            "target_allocation": adjusted,
            "actual_allocation": adjusted,
            "orders": results,
            "approved": True,
            "executed": True,
        })
        self.save_real_portfolio()

        success_count = sum(1 for r in results if r.get("status") == "submitted")
        notify(f"\u2705 *메타 매니저 완료* — {success_count}/{len(results)}건 체결")

        return {"status": "executed", "orders": results}


# --- CLI ---

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="메타 매니저")
    parser.add_argument("--dry-run", action="store_true", help="드라이런 (분석만, 주문 스킵)")
    parser.add_argument("--date", type=str, default=None, help="날짜 (YYYY-MM-DD)")
    parser.add_argument("--analyze-only", action="store_true", help="분석만 실행 (배분 결정 없이)")
    args = parser.parse_args()

    mm = MetaManager(date_str=args.date)

    if args.analyze_only:
        result = mm.run(dry_run=True)
        if result["status"] == "awaiting_decision":
            print(result["analysis_text"])
        else:
            print(f"상태: {result['status']}")
    else:
        result = mm.run(dry_run=args.dry_run)
        print(json.dumps({"status": result["status"]}, ensure_ascii=False, indent=2))
        if result.get("analysis_text"):
            print("\n" + result["analysis_text"])
