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
    get_meta_config, update_meta_config,
    is_rebalance_day, check_stop_loss, check_trailing_protect,
    check_holding_period, enforce_turnover_limit,
    is_stabilization_period, get_stabilization_tickers,
    enforce_regime_limit, STABILIZATION_LARGE_CAPS,
)
from send_telegram import send_telegram, send_approval_request, wait_for_approval
from logger import get_logger

logger = get_logger(__name__)

INITIAL_CAPITAL = 2_000_000  # 실전 초기 자금

REGIME_KR = {"bear": "약세장", "neutral": "중립장", "bull": "강세장"}


def _emergency_reason_kr(reason):
    """긴급 매매 사유 한글 변환"""
    return {"stop_loss": "손절", "trailing_protect": "급락방어"}.get(reason, reason)


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

    def _get_db_regime(self):
        """market_regimes 테이블에서 해당 날짜의 실제 레짐 조회 (#48)"""
        try:
            rows = (
                supabase.table("market_regimes")
                .select("regime")
                .lte("date", self.date_str)
                .order("date", desc=True)
                .limit(1)
                .execute()
                .data
            )
            if rows:
                return rows[0]["regime"]
        except Exception as e:
            logger.warning(f"DB 레짐 조회 실패: {e}")
        return "neutral"

    # ─── Step 1: 데이터 수집 ─────────────────────────

    def collect_data(self):
        """Supabase + KIS에서 분석에 필요한 모든 데이터 수집"""
        data = {}

        # 마켓 레짐 (해당 날짜 이하 최신 #48)
        regime_rows = (
            supabase.table("market_regimes")
            .select("date, regime, bull_score, kospi_price")
            .lte("date", self.date_str)
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
                warn = f" ⚠️{sc['dataWarning']}" if sc.get("dataWarning") else ""
                cats = sc["categories"]
                lines.append(
                    f"- #{sc['rank']} {sc['investor']}({sc['investorId']}): "
                    f"총점 {sc['totalScore']} | "
                    f"수익 {cats['profitability']['score']:.0f} · "
                    f"위험조정 {cats['riskAdjusted']['score']:.0f} · "
                    f"방어 {cats['defense']['score']:.0f} · "
                    f"일관 {cats['consistency']['score']:.0f}{rec}{warn}"
                )
            lines.append("")

        # 추천 전략(⭐) 보유 종목 (#48)
        recommended_scs = [sc for sc in scorecards if sc.get("recommended")]
        if recommended_scs:
            lines.append("## 추천 전략(⭐) 보유 종목")
            try:
                for sc in recommended_scs:
                    inv_id = sc["investorId"]
                    snap = (
                        supabase.table("portfolio_snapshots")
                        .select("holdings")
                        .eq("investor_id", inv_id)
                        .order("date", desc=True)
                        .limit(1)
                        .execute()
                        .data
                    )
                    if snap and snap[0].get("holdings"):
                        h_items = snap[0]["holdings"]
                        sorted_items = sorted(h_items.items(), key=lambda x: x[1].get("eval_amount", 0), reverse=True)
                        top_tickers = [f"{t}({v.get('weight', 0)*100:.0f}%)" for t, v in sorted_items[:5]]
                        lines.append(f"- {sc['investor']}({inv_id}): {', '.join(top_tickers)}")
            except Exception as e:
                logger.warning(f"추천 전략 보유종목 조회 실패: {e}")
            lines.append("")

        # 15명 합의 종목 (#48, E 제외)
        try:
            latest_snaps = (
                supabase.table("portfolio_snapshots")
                .select("investor_id, holdings")
                .order("date", desc=True)
                .limit(15)
                .execute()
                .data
            )
            # 최신 날짜의 스냅샷만 사용
            if latest_snaps:
                latest_date = None
                for s in latest_snaps:
                    # date 필드가 없을 수 있으므로 최대 15건 중 처리
                    pass
                # investor_id별 최신 스냅샷 (별도 쿼리)
                snap_date_rows = (
                    supabase.table("portfolio_snapshots")
                    .select("date")
                    .order("date", desc=True)
                    .limit(1)
                    .execute()
                    .data
                )
                if snap_date_rows:
                    snap_date = snap_date_rows[0]["date"]
                    all_snaps = (
                        supabase.table("portfolio_snapshots")
                        .select("investor_id, holdings")
                        .eq("date", snap_date)
                        .execute()
                        .data
                    )
                    ticker_holders = defaultdict(list)
                    for s in all_snaps:
                        if s["investor_id"] == "E":  # E 벤치마크 제외 (#48)
                            continue
                        if s.get("holdings"):
                            for ticker in s["holdings"].keys():
                                ticker_holders[ticker].append(s["investor_id"])

                    consensus = [(t, holders) for t, holders in ticker_holders.items() if len(holders) >= 3]
                    consensus.sort(key=lambda x: -len(x[1]))

                    if consensus:
                        lines.append("## 15명 합의 종목 (3명+ 보유, E 제외)")
                        for ticker, holders in consensus[:15]:
                            lines.append(f"- {ticker}: {len(holders)}명 ({','.join(sorted(holders))})")
                        lines.append("")
        except Exception as e:
            logger.warning(f"합의 종목 조회 실패: {e}")

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

        # 보유기간 제약
        prev = get_prev_real_portfolio()
        prev_holdings = prev.get("holdings", {}) if prev else {}
        meta_config = get_meta_config()
        if holdings:
            lines.append("## 보유기간 제약")
            from safety import _count_business_days
            for h in holdings:
                acq = prev_holdings.get(h["ticker"], {}).get("acquired_date")
                if acq:
                    bdays = _count_business_days(
                        datetime.strptime(acq, "%Y-%m-%d").date(),
                        datetime.strptime(self.date_str, "%Y-%m-%d").date(),
                    )
                    status = "매도가능" if bdays >= meta_config.get("min_holding_days", 3) else "보유필수"
                    lines.append(f"- {h['name']}: 매수일 {acq}, {bdays}영업일 ({status})")
                else:
                    lines.append(f"- {h['name']}: 매수일 미상 (매도가능)")
            lines.append("")

        # 안정화 기간 경고 + 허용 종목 목록 (#48)
        if is_stabilization_period(self.date_str, meta_config):
            lines.append("## ⚠️ 안정화 기간")
            lines.append(f"- ~{meta_config.get('stabilization_end_date')}까지 대형주(시총 상위 30)만 매매 가능")
            lines.append(f"- 현금 최소 40% 유지 (레짐 무관)")
            lines.append(f"- 허용 종목: {', '.join(sorted(STABILIZATION_LARGE_CAPS))}")
            lines.append("")

        # 레짐별 투자 한도 안내 (#48)
        regime_name = regime.get("regime", "neutral") if isinstance(regime, dict) else str(regime)
        regime_limits = {"bear": "30%", "neutral": "60%", "bull": "90%"}
        lines.append("## 매매 제약")
        lines.append(f"- 레짐({regime_name}) 최대 투자 비중: {regime_limits.get(regime_name, '60%')} (코드 자동 강제)")
        lines.append(f"- 회전율 한도: 총자산의 {meta_config.get('max_turnover_pct', 25)}% 이내")
        lines.append(f"- 최소 보유기간: {meta_config.get('min_holding_days', 5)}영업일")
        sl_by_regime = meta_config.get("stop_loss_by_regime", {"bear": -7, "neutral": -8, "bull": -10})
        lines.append(f"- 손절: {sl_by_regime.get(regime_name, -8)}% (레짐별 차등)")
        trailing_threshold = meta_config.get("trailing_protect_threshold_pct", 20)
        trailing_drawdown = meta_config.get("trailing_protect_drawdown_pct", 15)
        lines.append(f"- 급락 방어: +{trailing_threshold}% 도달 후 고점 대비 -{trailing_drawdown}% 이탈 시 매도")
        lines.append("")

        lines.append("## 요청")
        lines.append("위 분석을 바탕으로 최적 전략 조합과 종목별 비중(allocation)을 결정해주세요.")
        lines.append("형식: {\"ticker\": weight, ...} (weight 합계 ≤ 0.95, ticker는 yfinance 형식)")
        lines.append("함께 rationale(근거)도 작성해주세요.")

        return "\n".join(lines)

    # ─── Step 4: 주문 생성 + 실행 ─────────────────

    def compute_orders(self, target_allocation, current_holdings, total_asset,
                       meta_config=None, prev_holdings=None):
        """현재 vs 목표 비교하여 매매 주문 생성 (매도 먼저)

        보호 장치 적용:
        - 안정화 기간이면 대형주 외 종목 제거 (#47)
        - 보유기간 3영업일 미충족 종목은 매도 스킵 (#45)
        - 회전율 40% 초과 시 주문 비례 축소 (#46)

        Args:
            target_allocation: {"005930.KS": 0.15, ...}
            current_holdings: KIS get_holdings() 결과
            total_asset: 총자산 (현금 + 평가액)
            meta_config: get_meta_config() 결과 (없으면 자동 로드)
            prev_holdings: real_portfolio.holdings (acquired_date 포함)

        Returns:
            [{"ticker": str, "code": str, "side": str, "qty": int, "price": int}, ...]
        """
        if meta_config is None:
            meta_config = get_meta_config()
        if prev_holdings is None:
            prev = get_prev_real_portfolio()
            prev_holdings = prev.get("holdings", {}) if prev else {}

        # 안정화 기간 필터: 대형주 외 종목 제거 (#47)
        if is_stabilization_period(self.date_str, meta_config):
            allowed = get_stabilization_tickers()
            filtered = {t: w for t, w in target_allocation.items() if t in allowed}
            if filtered != target_allocation:
                removed = set(target_allocation.keys()) - set(filtered.keys())
                if removed:
                    logger.info(f"안정화 기간 — 대형주 외 종목 제거: {removed}")
            target_allocation = filtered

        # 현재 보유 매핑
        current_map = {}
        for h in current_holdings:
            current_map[h["ticker"]] = {
                "shares": h["shares"],
                "current_price": h["current_price"],
                "code": h["code"],
                "name": h["name"],
                "avg_price": h.get("avg_price", 0),
                "profit_pct": h.get("profit_pct", 0),
            }

        orders = []

        # 매도 주문 (보유 중이지만 목표에 없거나 축소할 종목)
        for ticker, holding in current_map.items():
            target_weight = target_allocation.get(ticker, 0)
            target_value = int(total_asset * target_weight)
            current_value = holding["shares"] * holding["current_price"]

            need_sell = False
            sell_qty = 0
            is_liquidation = False

            if target_weight == 0:
                need_sell = True
                sell_qty = holding["shares"]
                is_liquidation = True
            elif target_value < current_value * 0.9:
                need_sell = True
                sell_value = current_value - target_value
                sell_qty = max(1, sell_value // holding["current_price"])
                if sell_qty > holding["shares"]:
                    sell_qty = holding["shares"]

            if need_sell and sell_qty > 0:
                # 보유기간 체크 (#45): 3영업일 미충족이면 매도 스킵
                if not check_holding_period(ticker, prev_holdings, self.date_str, meta_config):
                    logger.info(f"최소 보유기간 미충족 — 매도 스킵: {ticker}")
                    continue

                orders.append({
                    "ticker": ticker,
                    "code": holding["code"],
                    "name": holding["name"],
                    "side": "sell",
                    "qty": sell_qty,
                    "price": holding["current_price"],
                    "avg_price": holding.get("avg_price", 0),
                    "profit_pct": round(holding.get("profit_pct", 0), 2),
                    "liquidation": is_liquidation,
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

        # 회전율 제한 (#46): 한도 초과 시 비례 축소
        if orders:
            orders, truncated = enforce_turnover_limit(orders, total_asset, meta_config)
            if truncated:
                max_t = meta_config.get("max_turnover_pct", 25) if meta_config else 25
                notify(f"⚠️ 회전율 한도({max_t}%) 초과 — 주문 비례 축소")

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
            "decision_type": decision.get("decision_type", "regular"),
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

    def save_real_portfolio(self, executed_orders=None):
        """KIS 잔고 기반 real_portfolio 테이블 저장

        Args:
            executed_orders: execute_orders() 결과 (매수 종목의 acquired_date 설정용)
        """
        try:
            holdings_raw = self.kis.get_holdings()
            balance = self.kis.get_balance()
            cash = balance.get("cash", 0)
            total_asset = balance.get("total_asset", 0)

            holdings = {}
            total_eval = 0
            for h in holdings_raw:
                holdings[h["ticker"]] = {
                    "shares": h["shares"],
                    "avg_price": h["avg_price"],
                    "name": h["name"],
                }
                total_eval += h["eval_amount"]

            # acquired_date 병합: 이전 포트폴리오에서 계승 + 신규 매수 종목은 오늘 날짜
            prev = get_prev_real_portfolio()
            prev_holdings = prev.get("holdings", {}) if prev else {}
            for ticker, h in holdings.items():
                if ticker in prev_holdings and prev_holdings[ticker].get("acquired_date"):
                    h["acquired_date"] = prev_holdings[ticker]["acquired_date"]
                if executed_orders:
                    for order in executed_orders:
                        if (order.get("ticker") == ticker
                                and order.get("side") == "buy"
                                and order.get("status") == "submitted"):
                            h["acquired_date"] = self.date_str
                            break
                # fallback: acquired_date가 아직 없으면 오늘 날짜로 설정
                if "acquired_date" not in h:
                    h["acquired_date"] = self.date_str

            # high_water_mark 추적 (#55): 종목별 고점 갱신
            price_map = {raw_h["ticker"]: raw_h["current_price"] for raw_h in holdings_raw}
            for ticker, h in holdings.items():
                current_price = price_map.get(ticker)
                if current_price is None:
                    continue
                prev_hwm = prev_holdings.get(ticker, {}).get("high_water_mark")
                h["high_water_mark"] = max(prev_hwm, current_price) if prev_hwm is not None else current_price

            if total_asset <= 0:
                total_asset = cash + total_eval

            # 전일 포트폴리오에서 수익률 계산
            prev = get_prev_real_portfolio()
            daily_return_pct = 0
            cumulative_return_pct = round((total_asset / INITIAL_CAPITAL - 1) * 100, 2)

            if prev and prev.get("total_asset", 0) > 0:
                daily_return_pct = round((total_asset / prev["total_asset"] - 1) * 100, 2)

            # KOSPI 수익률 추적 (yfinance 실시간 조회 + 과거 데이터 자동 보정)
            kospi_cumulative_pct = None
            alpha_cumulative_pct = None
            try:
                import yfinance as yf
                from datetime import timedelta
                # 전체 real_portfolio 조회 (과거 보정용)
                all_rows = (
                    supabase.table("real_portfolio")
                    .select("date, cumulative_return_pct, kospi_cumulative_pct")
                    .order("date")
                    .execute()
                    .data
                )
                if all_rows:
                    start_date = all_rows[0]["date"]
                    end_dt = datetime.strptime(self.date_str, "%Y-%m-%d") + timedelta(days=1)
                    kospi = yf.download("^KS11", start=start_date, end=end_dt.strftime("%Y-%m-%d"), progress=False)
                    if len(kospi) >= 1:
                        start_kospi = float(kospi["Close"].iloc[0])
                        # 오늘 값 계산
                        latest_kospi = float(kospi["Close"].iloc[-1])
                        if start_kospi > 0:
                            kospi_cumulative_pct = round((latest_kospi / start_kospi - 1) * 100, 2)
                            alpha_cumulative_pct = round(cumulative_return_pct - kospi_cumulative_pct, 2)
                            logger.info(f"KOSPI: {start_kospi:.0f} → {latest_kospi:.0f} ({kospi_cumulative_pct:+.2f}%)")
                        # 과거 레코드 자동 보정 (오늘 제외)
                        for r in all_rows:
                            if r["date"] == self.date_str:
                                continue
                            mask = kospi.index <= r["date"] + " 23:59:59"
                            if mask.any() and start_kospi > 0:
                                k = float(kospi.loc[mask, "Close"].iloc[-1])
                                correct_pct = round((k / start_kospi - 1) * 100, 2)
                                if r["kospi_cumulative_pct"] != correct_pct:
                                    alpha = round(r["cumulative_return_pct"] - correct_pct, 2)
                                    supabase.table("real_portfolio").update({
                                        "kospi_cumulative_pct": correct_pct,
                                        "alpha_cumulative_pct": alpha,
                                    }).eq("date", r["date"]).execute()
                                    logger.info(f"KOSPI 보정: {r['date']} {r['kospi_cumulative_pct']}% → {correct_pct}%")
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
        """메타 매니저 전체 파이프라인

        3단계 분기:
        0. 안전 체크 (킬스위치, 일일/누적 손실) — 매일
        1. 긴급 체크 (레짐별 손절 + 급락 방어 트레일링) — 매일
        2. 리밸런싱 요일이면 전체 분석, 아니면 스킵

        Returns:
            {"status": str, ...}
            - "killed" / "daily_loss_halt" / "emergency_liquidated": 안전 장치 발동
            - "emergency_triggered": 손절/급락방어 대상 있음 → execute_emergency_orders() 호출 필요
            - "awaiting_decision": 정규 리밸런싱 → execute_allocation() 호출 필요
            - "skip": 비리밸런싱일 + 긴급 매매 없음
        """
        meta_config = get_meta_config()
        notify(f"🤖 *메타 매니저 시작* ({self.date_str})")

        # 0. 안전 체크
        if check_kill_switch():
            notify("🛑 킬스위치 활성화 — 실행 중단\n수동 해제: safety.py --kill-switch off")
            return {"status": "killed"}

        prev = get_prev_real_portfolio()
        if prev:
            try:
                balance = self.kis.get_balance()
                current_total = balance.get("total_asset", 0)
                if current_total <= 0:
                    current_total = balance.get("cash", 0) + balance.get("total_eval", 0)
            except Exception:
                current_total = prev.get("total_asset", INITIAL_CAPITAL)

            if check_daily_loss(current_total, prev.get("total_asset", 0)):
                prev_total = prev.get("total_asset", 0)
                daily_pct = (current_total / prev_total - 1) * 100 if prev_total > 0 else 0
                notify(
                    f"🔴 일일 손실 한도 초과 — 자동 중단\n"
                    f"전일 {prev_total:,}원 → 현재 {current_total:,}원 ({daily_pct:+.1f}%)\n"
                    f"한도: -3%\n\n"
                    f"하루 만에 {abs(daily_pct):.1f}% 하락하여 일일 손실 한도(-3%)를 초과했습니다. "
                    f"추가 손실을 방지하기 위해 오늘 모든 거래를 중단합니다."
                )
                return {"status": "daily_loss_halt"}

            if check_cumulative_loss(current_total, INITIAL_CAPITAL):
                cum_pct = (current_total / INITIAL_CAPITAL - 1) * 100
                notify(
                    f"🔴 누적 손실 한도 초과 — 전량 청산 시작\n"
                    f"초기 {INITIAL_CAPITAL:,}원 → 현재 {current_total:,}원 ({cum_pct:+.1f}%)\n"
                    f"한도: -10%\n\n"
                    f"초기 자금 대비 누적 {abs(cum_pct):.1f}% 손실이 발생하여 한도(-10%)를 초과했습니다. "
                    f"더 이상의 손실을 막기 위해 전 종목을 시장가로 청산합니다."
                )
                holdings = self.kis.get_holdings()
                emergency_liquidate(self.kis, holdings)
                return {"status": "emergency_liquidated"}

        # 1. 매일: 긴급 손절 + 급락 방어 체크 (#55)
        current_regime = self._get_db_regime()

        try:
            current_holdings = self.kis.get_holdings()
        except Exception as e:
            logger.error(f"KIS 보유종목 조회 실패: {e}")
            current_holdings = []

        if current_holdings:
            triggers = check_stop_loss(current_holdings, meta_config, regime=current_regime)
            prev_holdings = prev.get("holdings", {}) if prev else {}

            emergency_orders = []
            # 손절: 보유기간 무시 (항상 실행)
            for h in triggers["stop_loss"]:
                emergency_orders.append({
                    "ticker": h["ticker"], "code": h["code"], "name": h["name"],
                    "side": "sell", "qty": h["shares"], "price": h["current_price"],
                    "avg_price": h.get("avg_price", 0),
                    "profit_pct": round(h.get("profit_pct", 0), 2),
                    "reason": "stop_loss",
                })

            # 급락 방어 트레일링: +20% 도달 후 고점 대비 -15% 이탈 시 (#55)
            trailing_triggers = check_trailing_protect(current_holdings, prev_holdings, meta_config)
            sl_tickers = {o["ticker"] for o in emergency_orders}
            for t in trailing_triggers:
                h = t["holding"]
                if h["ticker"] in sl_tickers:
                    continue  # 손절 대상과 중복 방지
                emergency_orders.append({
                    "ticker": h["ticker"], "code": h["code"], "name": h["name"],
                    "side": "sell", "qty": h["shares"], "price": h["current_price"],
                    "avg_price": h.get("avg_price", 0),
                    "profit_pct": round(h.get("profit_pct", 0), 2),
                    "reason": "trailing_protect",
                    "high_water_mark": t["high_water_mark"],
                    "drawdown_from_high_pct": t["drawdown_from_high_pct"],
                })

            if emergency_orders:
                reasons = set(o["reason"] for o in emergency_orders)
                decision_type = "emergency_stop_loss" if "stop_loss" in reasons else "emergency_trailing_protect"
                sl_by_regime = meta_config.get("stop_loss_by_regime", {"bear": -7, "neutral": -8, "bull": -10})
                sl_threshold = sl_by_regime.get(current_regime, -8)
                order_details = []
                for o in emergency_orders:
                    h_match = [h for h in current_holdings if h["ticker"] == o["ticker"]]
                    pnl = h_match[0].get("profit_pct", 0) if h_match else 0
                    reason_kr = _emergency_reason_kr(o["reason"])
                    order_details.append(f"  · {o['name']} {pnl:+.1f}% → {reason_kr}")
                sl_names = [o["name"] for o in emergency_orders if o["reason"] == "stop_loss"]
                tp_names = [o["name"] for o in emergency_orders if o["reason"] == "trailing_protect"]
                regime_kr = REGIME_KR.get(current_regime, current_regime)
                desc_parts = []
                if sl_names:
                    desc_parts.append(f"현재 {regime_kr}에서 손절 기준({sl_threshold}%)을 초과한 {', '.join(sl_names)}의 매도가 필요합니다")
                if tp_names:
                    desc_parts.append(f"{', '.join(tp_names)}이(가) 고점 대비 급락하여 트레일링 보호 매도를 진행합니다")
                notify(
                    f"🚨 긴급 매매 감지 ({regime_kr})\n"
                    f"손절 기준: {sl_threshold}%\n"
                    + "\n".join(order_details) + "\n\n"
                    + ". ".join(desc_parts) + "."
                )
                return {
                    "status": "emergency_triggered",
                    "decision_type": decision_type,
                    "emergency_orders": emergency_orders,
                    "rebalance_today": is_rebalance_day(self.date_str, meta_config),
                }

        # 2. 리밸런싱 요일 체크 (#43)
        if not is_rebalance_day(self.date_str, meta_config):
            d = datetime.strptime(self.date_str, "%Y-%m-%d")
            day_kr = ["월", "화", "수", "목", "금", "토", "일"][d.weekday()]
            iso_week = d.isocalendar()[1]
            freq = meta_config.get("rebalance_frequency", "weekly")
            week_info = f"ISO {iso_week}주({'짝수' if iso_week % 2 == 0 else '홀수'})" if freq == "biweekly" else ""
            holdings_summary = f" · 보유 {len(current_holdings)}종목" if current_holdings else ""
            rebal_day = meta_config.get("rebalance_day", "wednesday")
            day_kr_map = {"monday": "월", "tuesday": "화", "wednesday": "수", "thursday": "목", "friday": "금"}
            target_day_kr = day_kr_map.get(rebal_day, "수")
            regime_kr = REGIME_KR.get(current_regime, current_regime)
            notify(
                f"ℹ️ 스킵 — {day_kr}요일{' · ' + week_info if week_info else ''}\n"
                f"긴급 매매 없음 ({regime_kr}){holdings_summary}\n\n"
                f"오늘은 {day_kr}요일이라 정규 리밸런싱 대상이 아닙니다"
                f"{'(' + week_info + ', 짝수 주만 실행)' if week_info else ''}. "
                f"보유 종목의 손절/급락방어 기준에 해당하는 종목도 없어 거래 없이 마칩니다. "
                f"다음 리밸런싱은 격주 {target_day_kr}요일에 진행됩니다."
            )
            self.save_decision({
                "regime": "",
                "decision_type": "skip",
                "rationale": "비리밸런싱일 — 스킵",
                "target_allocation": None,
                "orders": [],
                "approved": True,
                "executed": False,
            })
            # 매매 없어도 자산 가치 변동 반영을 위해 스냅샷 저장
            self.save_real_portfolio()
            return {"status": "skip"}

        # 3. 정규 리밸런싱: 전체 분석 파이프라인
        notify("\U0001f4ca Step 1: 데이터 수집")
        data = self.collect_data()

        notify("\U0001f9e0 Step 2: 정량 분석")
        analysis = self.analyze(data)

        analysis_text = self.format_analysis_for_claude(analysis)

        notify("\u2705 분석 완료 — Claude의 배분 결정을 기다립니다")

        regime_str = analysis.get("regime", {}).get("regime", "") if isinstance(analysis.get("regime"), dict) else ""
        morning = analysis.get("morning_session")

        return {
            "status": "awaiting_decision",
            "decision_type": "regular",
            "analysis": analysis,
            "analysis_text": analysis_text,
            "regime": regime_str,
            "morning_session": morning,
        }

    def execute_emergency_orders(self, orders, decision_type="emergency_stop_loss",
                                regime="", dry_run=False):
        """긴급 매도 실행 (손절/급락방어)

        Args:
            orders: run()에서 반환된 emergency_orders
            decision_type: "emergency_stop_loss" | "emergency_trailing_protect"
            regime: 현재 마켓 레짐
            dry_run: True이면 주문 스킵

        Returns:
            {"status": str, "orders": list}
        """
        if not orders:
            return {"status": "no_orders", "orders": []}

        # 상세 rationale 자동 생성
        regime_kr = REGIME_KR.get(regime, regime)
        meta_config = get_meta_config()
        sl_by_regime = meta_config.get("stop_loss_by_regime", {"bear": -7, "neutral": -8, "bull": -10})
        sl_threshold = sl_by_regime.get(regime, -8)
        rationale_parts = []
        for o in orders:
            reason_kr = _emergency_reason_kr(o.get("reason"))
            if o.get("reason") == "stop_loss":
                threshold = f"{sl_threshold}%"
            elif o.get("reason") == "trailing_protect":
                threshold = f"고점({o.get('high_water_mark', 0):,.0f}원) 대비 -{o.get('drawdown_from_high_pct', 0):.1f}%"
            else:
                threshold = ""
            rationale_parts.append(f"{o.get('name', o['code'])} {reason_kr} (기준: {threshold})")
        auto_rationale = f"시장 국면 {regime_kr}에서 긴급 매매 실행.\n" + "\n".join(rationale_parts)

        # 주문 요약
        order_lines = []
        for o in orders:
            reason_kr = _emergency_reason_kr(o.get("reason"))
            order_lines.append(
                f"\U0001f534 {reason_kr} 매도 {o.get('name', o['code'])} x{o['qty']} "
                f"(~{o['qty'] * o['price']:,}원)"
            )

        msg = (
            f"\U0001f6a8 *긴급 매매 확인* ({self.date_str})\n\n"
            f"{chr(10).join(order_lines)}"
        )

        if dry_run:
            notify(f"\U0001f527 [드라이런] 긴급 매매 {len(orders)}건 (실행 스킵)\n\n" +
                   "\n".join(order_lines))
            self.save_decision({
                "regime": regime,
                "decision_type": decision_type,
                "rationale": auto_rationale,
                "orders": orders,
                "approved": False,
                "executed": False,
            })
            return {"status": "dry_run", "orders": orders}

        if not is_trading_hours():
            notify("\u23f0 장 운영시간 외 — 긴급 매매 불가")
            self.save_decision({
                "regime": regime,
                "decision_type": decision_type,
                "rationale": auto_rationale + "\n(장 운영시간 외 — 미체결)",
                "orders": orders,
                "approved": False,
                "executed": False,
            })
            return {"status": "market_closed", "orders": orders}

        # 텔레그램 승인 요청
        send_approval_request(msg, self.date_str)
        approved = wait_for_approval(self.date_str, timeout_sec=300)

        if not approved:
            notify("\u274c 긴급 매매 거부/타임아웃")
            self.save_decision({
                "regime": regime,
                "decision_type": decision_type,
                "rationale": auto_rationale + "\n(텔레그램 승인 거부/타임아웃 — 미체결)",
                "orders": orders,
                "approved": False,
                "executed": False,
            })
            return {"status": "rejected", "orders": orders}

        # 주문 실행
        notify("\u26a1 긴급 매매 실행 중...")
        results = self.execute_orders(orders)

        # 저장
        self.save_decision({
            "regime": regime,
            "decision_type": decision_type,
            "rationale": auto_rationale,
            "orders": results,
            "approved": True,
            "executed": True,
        })
        self.save_real_portfolio(executed_orders=results)

        success_count = sum(1 for r in results if r.get("status") == "submitted")
        result_lines = []
        for r in results:
            emoji = "✅" if r.get("status") == "submitted" else "❌"
            reason_kr = _emergency_reason_kr(r.get("reason"))
            result_lines.append(f"  {emoji} {reason_kr} {r.get('name', r['code'])} x{r['qty']}")
        failed = len(results) - success_count
        desc = f"총 {len(results)}건 중 {success_count}건이 정상 체결되었습니다."
        if failed > 0:
            desc += f" {failed}건은 체결에 실패했으니 확인이 필요합니다."
        notify(
            f"✅ *긴급 매매 완료* ({self.date_str})\n"
            f"체결: {success_count}/{len(results)}건\n"
            + "\n".join(result_lines) + f"\n\n{desc}"
        )

        return {"status": "executed", "orders": results}

    def execute_allocation(self, target_allocation, rationale, selected_strategies=None,
                           regime="", morning_session=None, dry_run=False, force=False):
        """Claude가 결정한 배분을 실행 (정규 리밸런싱)

        Args:
            target_allocation: {"005930.KS": 0.15, ...}
            rationale: 배분 근거 텍스트
            selected_strategies: {"B": 0.4, "K": 0.3, "J": 0.3} 등
            regime: 현재 마켓 레짐 (bull/neutral/bear)
            morning_session: 오전장 시장 데이터 (KOSPI, 수급 등)
            dry_run: True이면 분석만, 주문 스킵
            force: True이면 요일 가드 무시

        Returns:
            {"status": str, "orders": list}
        """
        meta_config = get_meta_config()

        # 0. 요일 가드 (#48): 비리밸런싱일이면 거부
        if not force and not is_rebalance_day(self.date_str, meta_config):
            msg = f"⚠️ {self.date_str}은 리밸런싱 요일이 아닙니다. force=True로 오버라이드 가능"
            notify(msg)
            logger.warning(msg)
            return {"status": "rejected", "reason": "not_rebalance_day"}

        # 0b. 레짐 DB 강제 (#48): caller 전달값 무시, DB 값 사용
        db_regime = self._get_db_regime()
        if regime and regime != db_regime:
            regime_limits = {"bear": "30%", "neutral": "60%", "bull": "90%"}
            regime_from_kr = REGIME_KR.get(regime, regime)
            regime_to_kr = REGIME_KR.get(db_regime, db_regime)
            notify(
                f"⚠️ 레짐 불일치 — AI 판단: {regime_from_kr}, 실제: {regime_to_kr}\n"
                f"실제 값({regime_to_kr}) 사용 → 최대 투자 {regime_limits.get(db_regime, '60%')}\n\n"
                f"AI가 {regime_from_kr}으로 판단했지만, 실제 시장 지표(이평선/거래량/변동성)는 "
                f"{regime_to_kr}을 가리키고 있어 실제 기준으로 교체합니다."
            )
        regime = db_regime

        # 1. 배분 검증 (stock_universe 포함 #48)
        adjusted, violations = validate_meta_allocation(target_allocation)
        if violations:
            notify(f"⚠️ 배분 검증 위반 {len(violations)}건:\n" +
                   "\n".join(f"- {v['detail']}" for v in violations))

        # 1b. 레짐별 투자 비중 강제 (#48)
        adjusted, applied_limit, was_scaled = enforce_regime_limit(
            adjusted, regime, self.date_str, meta_config
        )
        if was_scaled:
            alloc_before = sum(target_allocation.values())
            alloc_after = sum(adjusted.values())
            cash_pct = (1 - alloc_after) * 100
            regime_kr = REGIME_KR.get(regime, regime)
            notify(
                f"📉 {regime_kr} 한도 적용\n"
                f"배분 합계: {alloc_before*100:.0f}% → {alloc_after*100:.0f}% (한도 {applied_limit*100:.0f}%)\n"
                f"현금 비중: {cash_pct:.0f}%\n\n"
                f"현재 {regime_kr}이므로 최대 투자 비중을 {applied_limit*100:.0f}%로 제한합니다. "
                f"AI가 제안한 {alloc_before*100:.0f}% 배분을 {alloc_after*100:.0f}%로 축소하고 "
                f"나머지 {cash_pct:.0f}%는 현금으로 보유합니다."
            )

        # 2. 주문 생성 (보유기간/안정화/회전율 필터 포함)
        current_holdings = self.kis.get_holdings()
        balance = self.kis.get_balance()
        total_asset = balance.get("total_asset", 0)
        if total_asset <= 0:
            total_asset = balance.get("cash", 0) + balance.get("total_eval", 0)

        prev = get_prev_real_portfolio()
        prev_holdings = prev.get("holdings", {}) if prev else {}

        orders = self.compute_orders(adjusted, current_holdings, total_asset,
                                     meta_config=meta_config, prev_holdings=prev_holdings)

        if not orders:
            notify("\u2139\ufe0f 리밸런싱 불필요 — 현재 포지션이 목표와 유사합니다")
            self.save_decision({
                "regime": regime,
                "decision_type": "regular",
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

        # 텔레그램 Markdown v1 특수문자 제거 (rationale에 *, _, ` 등 포함 가능)
        safe_rationale = rationale[:200].replace('*', '').replace('_', '').replace('`', '').replace('[', '(').replace(']', ')')

        msg = (
            f"\U0001f4cb *메타 매니저 주문 확인* ({self.date_str})\n\n"
            f"{chr(10).join(order_lines)}\n\n"
            f"근거: {safe_rationale}"
        )

        if dry_run:
            notify(f"\U0001f527 [드라이런] 주문 {len(orders)}건 생성 (실행 스킵)\n\n" +
                   "\n".join(order_lines))
            self.save_decision({
                "regime": regime,
                "decision_type": "regular",
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
                "decision_type": "regular",
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
                "decision_type": "regular",
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
            "decision_type": "regular",
            "morning_session": morning_session,
            "selected_strategies": selected_strategies,
            "rationale": rationale,
            "target_allocation": adjusted,
            "actual_allocation": adjusted,
            "orders": results,
            "approved": True,
            "executed": True,
        })
        self.save_real_portfolio(executed_orders=results)

        # 정규 리밸런싱 완료 기록
        try:
            update_meta_config({"last_regular_rebalance": self.date_str})
        except Exception:
            pass

        success_count = sum(1 for r in results if r.get("status") == "submitted")
        sell_count = sum(1 for r in results if r["side"] == "sell" and r.get("status") == "submitted")
        buy_count = sum(1 for r in results if r["side"] == "buy" and r.get("status") == "submitted")
        result_lines = []
        for r in results:
            emoji = "✅" if r.get("status") == "submitted" else "❌"
            side_kr = "매도" if r["side"] == "sell" else "매수"
            result_lines.append(f"  {emoji} {side_kr} {r.get('name', r['code'])} x{r['qty']}")
        regime_kr = REGIME_KR.get(regime, regime)
        desc_parts = []
        if sell_count:
            desc_parts.append(f"{sell_count}종목 매도")
        if buy_count:
            desc_parts.append(f"{buy_count}종목 매수")
        notify(
            f"✅ *메타 매니저 완료* ({self.date_str})\n"
            f"{regime_kr} · 체결: {success_count}/{len(results)}건\n"
            + "\n".join(result_lines) + "\n\n"
            f"{regime_kr} 기준으로 {', '.join(desc_parts)}하여 포트폴리오를 조정했습니다. "
            f"근거: {rationale[:150].replace('*', '').replace('_', '').replace('`', '').replace('[', '(').replace(']', ')')}"
        )

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
        status = result["status"]
        print(json.dumps({
            "status": status,
            "decision_type": result.get("decision_type", ""),
        }, ensure_ascii=False, indent=2))

        if status == "awaiting_decision" and result.get("analysis_text"):
            print("\n" + result["analysis_text"])
        elif status == "emergency_triggered":
            print("\n긴급 매매 대상:")
            for o in result.get("emergency_orders", []):
                print(f"  - {o['reason']}: {o['name']} x{o['qty']}")
        elif status == "skip":
            print("\n비리밸런싱일 — 긴급 매매 없음")
