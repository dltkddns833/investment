"""전략 스코어카드 엔진 (Python 포트)

web/src/lib/scorecard.ts의 Python 버전.
6개 카테고리 가중 평균으로 14명 투자자의 전략 종합 평가.
메타 매니저가 투자자 품질을 판단하는 데 사용한다.
"""
import sys
import math
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).resolve().parent))
from supabase_client import supabase
from logger import get_logger

logger = get_logger(__name__)

WEIGHTS = {
    "profitability": 0.25,
    "riskAdjusted": 0.25,
    "defense": 0.20,
    "consistency": 0.15,
    "efficiency": 0.10,
    "validation": 0.05,
}

INITIAL_CAPITAL = 5_000_000


# --- 헬퍼 함수 ---

def _min_max_normalize(values, higher_better=True):
    """0~100 정규화. higher_better=False이면 반전."""
    if not values:
        return []
    mn = min(values)
    mx = max(values)
    rng = mx - mn
    if rng == 0:
        return [50.0] * len(values)
    normalized = [((v - mn) / rng) * 100 for v in values]
    if not higher_better:
        normalized = [100 - n for n in normalized]
    return normalized


def _assign_ranks(scores):
    """점수 기준 순위 (1=최고). 동점 시 같은 순위."""
    indexed = sorted(enumerate(scores), key=lambda x: -x[1])
    ranks = [0] * len(scores)
    for i, (orig_idx, _) in enumerate(indexed):
        ranks[orig_idx] = i + 1
    return ranks


def _compute_sortino(daily_returns, risk_free_rate=0.035):
    """Sortino 비율 계산"""
    if len(daily_returns) < 4:
        return 0.0
    daily_rf = risk_free_rate / 252
    excess = [r - daily_rf for r in daily_returns]
    mean_excess = sum(excess) / len(excess)
    downside = [r for r in excess if r < 0]
    if not downside:
        return 3.0 if mean_excess > 0 else 0.0
    downside_var = sum(r * r for r in downside) / len(downside)
    downside_std = math.sqrt(downside_var)
    if downside_std == 0:
        return 0.0
    return (mean_excess * math.sqrt(252)) / (downside_std * math.sqrt(252))


def _max_consecutive_loss_days(daily_returns):
    """최대 연속 손실일 수"""
    max_streak = 0
    current = 0
    for r in daily_returns:
        if r < 0:
            current += 1
            if current > max_streak:
                max_streak = current
        else:
            current = 0
    return max_streak


def _monthly_return_std_dev(date_assets):
    """월간 수익률 표준편차 (%)

    Args:
        date_assets: [(date_str, asset_value), ...] 시간순
    """
    if len(date_assets) < 2:
        return 0.0

    # 월별 그룹화
    monthly = defaultdict(list)
    for date_str, asset in date_assets:
        month = date_str[:7]  # YYYY-MM
        monthly[month].append(asset)

    months = sorted(monthly.keys())
    if len(months) < 2:
        return 0.0

    monthly_returns = []
    for month in months:
        assets = monthly[month]
        first, last = assets[0], assets[-1]
        if first > 0:
            monthly_returns.append((last - first) / first)

    if len(monthly_returns) < 2:
        return 0.0

    mean = sum(monthly_returns) / len(monthly_returns)
    variance = sum((r - mean) ** 2 for r in monthly_returns) / len(monthly_returns)
    return math.sqrt(variance) * 100


def _compute_sharpe(daily_returns, risk_free_rate=0.035):
    """Sharpe 비율 계산"""
    if len(daily_returns) < 4:
        return 0.0
    daily_rf = risk_free_rate / 252
    mean_r = sum(daily_returns) / len(daily_returns)
    variance = sum((r - mean_r) ** 2 for r in daily_returns) / len(daily_returns)
    daily_vol = math.sqrt(variance)
    if daily_vol == 0:
        return 0.0
    excess = [r - daily_rf for r in daily_returns]
    mean_excess = sum(excess) / len(excess)
    return mean_excess / daily_vol * math.sqrt(252)


def _compute_mdd(assets):
    """MDD 계산 (%)"""
    if not assets:
        return 0.0
    peak = assets[0]
    max_dd = 0.0
    for asset in assets:
        if asset > peak:
            peak = asset
        dd = (asset - peak) / peak * 100 if peak > 0 else 0
        if dd < max_dd:
            max_dd = dd
    return max_dd


# --- 메인 함수 ---

def compute_scorecards(initial_capital=INITIAL_CAPITAL):
    """Supabase 데이터 기반 14명 투자자 스코어카드 계산

    Returns:
        [{
            "investor": "강돌진",
            "investorId": "A",
            "totalScore": 72.3,
            "rank": 1,
            "recommended": True,
            "categories": {
                "profitability": {"score": 85.0, "rank": 1, "details": {...}},
                ...
            }
        }, ...]
    """
    # 1. 프로필 로드
    profiles = supabase.table("profiles").select("id, name").execute().data
    name_to_id = {p["name"]: p["id"] for p in profiles}
    id_to_name = {p["id"]: p["name"] for p in profiles}
    investor_names = [p["name"] for p in profiles]
    investor_ids = [p["id"] for p in profiles]
    n = len(profiles)

    if n == 0:
        return []

    # 2. portfolio_snapshots 로드 (전체 기간)
    snapshots_raw = (
        supabase.table("portfolio_snapshots")
        .select("investor_id, date, total_asset")
        .order("date")
        .execute()
        .data
    )

    # 투자자별 자산 시계열
    investor_assets = defaultdict(list)  # id → [(date, asset), ...]
    for s in snapshots_raw:
        investor_assets[s["investor_id"]].append((s["date"], s["total_asset"]))

    # 3. 일별 수익률 계산
    daily_returns_map = {}  # id → [float, ...]
    asset_values_map = {}  # id → [int, ...]
    for inv_id in investor_ids:
        assets = investor_assets.get(inv_id, [])
        values = [a[1] for a in assets]
        asset_values_map[inv_id] = values
        returns = []
        for i in range(1, len(values)):
            if values[i - 1] > 0:
                returns.append(values[i] / values[i - 1] - 1)
            else:
                returns.append(0.0)
        daily_returns_map[inv_id] = returns

    # 4. 거래 내역 로드 (효율성 + 승률)
    transactions_raw = (
        supabase.table("transactions")
        .select("investor_id, type, amount, fee, profit")
        .execute()
        .data
    )

    txn_summary = {}  # id → {totalBuyAmount, totalSellAmount, totalFees, sellCount, wins}
    for inv_id in investor_ids:
        txn_summary[inv_id] = {
            "totalBuyAmount": 0, "totalSellAmount": 0,
            "totalFees": 0, "sellCount": 0, "wins": 0,
        }
    for t in transactions_raw:
        inv_id = t["investor_id"]
        if inv_id not in txn_summary:
            continue
        amount = abs(t.get("amount", 0))
        fee = abs(t.get("fee", 0))
        txn_summary[inv_id]["totalFees"] += fee
        if t["type"] == "buy":
            txn_summary[inv_id]["totalBuyAmount"] += amount
        elif t["type"] == "sell":
            txn_summary[inv_id]["totalSellAmount"] += amount
            txn_summary[inv_id]["sellCount"] += 1
            if t.get("profit", 0) > 0:
                txn_summary[inv_id]["wins"] += 1

    # 5. 백테스트 로드
    backtest_runs = (
        supabase.table("backtest_runs")
        .select("summary")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    latest_bt = backtest_runs[0] if backtest_runs else None

    # --- 카테고리별 점수 계산 ---

    # 누적 수익률
    cum_returns = []
    for inv_id in investor_ids:
        values = asset_values_map.get(inv_id, [])
        if values:
            cum_returns.append((values[-1] / initial_capital - 1) * 100)
        else:
            cum_returns.append(0.0)

    # Sharpe, Sortino
    sharpe_raw = [round(_compute_sharpe(daily_returns_map.get(inv_id, [])), 2) for inv_id in investor_ids]
    sortino_raw = [round(_compute_sortino(daily_returns_map.get(inv_id, [])), 2) for inv_id in investor_ids]

    # MDD
    mdd_raw = [round(_compute_mdd(asset_values_map.get(inv_id, [])), 2) for inv_id in investor_ids]

    # 연속 손실일
    cons_loss_raw = [_max_consecutive_loss_days(daily_returns_map.get(inv_id, [])) for inv_id in investor_ids]

    # 월간 수익률 표준편차
    month_std_raw = [
        round(_monthly_return_std_dev(investor_assets.get(inv_id, [])), 2)
        for inv_id in investor_ids
    ]

    # 승률
    win_rate_raw = []
    for inv_id in investor_ids:
        txn = txn_summary[inv_id]
        if txn["sellCount"] > 0:
            win_rate_raw.append(round(txn["wins"] / txn["sellCount"] * 100, 1))
        else:
            win_rate_raw.append(50.0)

    # 회전율, 수수료 비율
    avg_assets = []
    for inv_id in investor_ids:
        values = asset_values_map.get(inv_id, [])
        avg_assets.append(sum(values) / len(values) if values else initial_capital)

    turnover_raw = []
    fee_ratio_raw = []
    for i, inv_id in enumerate(investor_ids):
        txn = txn_summary[inv_id]
        avg = avg_assets[i]
        if avg > 0:
            turnover_raw.append((txn["totalBuyAmount"] + txn["totalSellAmount"]) / avg)
            fee_ratio_raw.append(txn["totalFees"] / avg)
        else:
            turnover_raw.append(0.0)
            fee_ratio_raw.append(0.0)

    # 백테스트 괴리도
    bt_map = {}
    if latest_bt and latest_bt.get("summary"):
        for r in latest_bt["summary"].get("rankings", []):
            bt_map[r["investor_id"]] = r.get("cumulative_return_pct", 0)

    divergence_raw = []
    for i, inv_id in enumerate(investor_ids):
        bt_return = bt_map.get(inv_id)
        if bt_return is not None:
            divergence_raw.append(abs(cum_returns[i] - bt_return))
        else:
            divergence_raw.append(0.0)

    # --- 정규화 ---

    # 1. 수익성 (25%)
    profit_scores = _min_max_normalize(cum_returns, higher_better=True)

    # 2. 위험조정 (25%) — Sharpe 70% + Sortino 30%
    sharpe_norm = _min_max_normalize(sharpe_raw, higher_better=True)
    sortino_norm = _min_max_normalize(sortino_raw, higher_better=True)
    risk_adj_scores = [s * 0.7 + t * 0.3 for s, t in zip(sharpe_norm, sortino_norm)]

    # 3. 방어력 (20%) — MDD 60% + 연속손실일 40%
    mdd_norm = _min_max_normalize(mdd_raw, higher_better=True)  # 덜 음수 = 더 좋음
    cons_loss_norm = _min_max_normalize(cons_loss_raw, higher_better=False)
    defense_scores = [m * 0.6 + c * 0.4 for m, c in zip(mdd_norm, cons_loss_norm)]

    # 4. 일관성 (15%) — 월간 수익률 표준편차 60% + 승률 40%
    month_std_norm = _min_max_normalize(month_std_raw, higher_better=False)
    win_rate_norm = _min_max_normalize(win_rate_raw, higher_better=True)
    consist_scores = [m * 0.6 + w * 0.4 for m, w in zip(month_std_norm, win_rate_norm)]

    # 5. 효율성 (10%) — 회전율 60% + 수수료 비율 40%
    turnover_norm = _min_max_normalize(turnover_raw, higher_better=False)
    fee_norm = _min_max_normalize(fee_ratio_raw, higher_better=False)
    efficiency_scores = [t * 0.6 + f * 0.4 for t, f in zip(turnover_norm, fee_norm)]

    # 6. 검증 (5%) — 괴리도
    validation_scores = _min_max_normalize(divergence_raw, higher_better=False)

    # --- 스코어카드 조립 ---

    scorecards = []
    for i, inv_id in enumerate(investor_ids):
        name = id_to_name[inv_id]
        categories = {
            "profitability": {
                "score": round(profit_scores[i], 1),
                "rank": 0,
                "details": {"cumulativeReturnPct": round(cum_returns[i], 2)},
            },
            "riskAdjusted": {
                "score": round(risk_adj_scores[i], 1),
                "rank": 0,
                "details": {"sharpeRatio": sharpe_raw[i], "sortinoRatio": sortino_raw[i]},
            },
            "defense": {
                "score": round(defense_scores[i], 1),
                "rank": 0,
                "details": {"mddPct": mdd_raw[i], "maxConsecutiveLossDays": cons_loss_raw[i]},
            },
            "consistency": {
                "score": round(consist_scores[i], 1),
                "rank": 0,
                "details": {"monthlyReturnStdDev": month_std_raw[i], "winRatePct": win_rate_raw[i]},
            },
            "efficiency": {
                "score": round(efficiency_scores[i], 1),
                "rank": 0,
                "details": {"turnoverRatio": round(turnover_raw[i], 3), "feeRatio": round(fee_ratio_raw[i], 5)},
            },
            "validation": {
                "score": round(validation_scores[i], 1),
                "rank": 0,
                "details": {
                    "liveReturnPct": round(cum_returns[i], 2),
                    "backtestReturnPct": round(bt_map.get(inv_id, 0), 2),
                },
            },
        }

        total_score = round(
            categories["profitability"]["score"] * WEIGHTS["profitability"]
            + categories["riskAdjusted"]["score"] * WEIGHTS["riskAdjusted"]
            + categories["defense"]["score"] * WEIGHTS["defense"]
            + categories["consistency"]["score"] * WEIGHTS["consistency"]
            + categories["efficiency"]["score"] * WEIGHTS["efficiency"]
            + categories["validation"]["score"] * WEIGHTS["validation"],
            1,
        )

        trading_days = len(daily_returns_map.get(inv_id, []))
        scorecards.append({
            "investor": name,
            "investorId": inv_id,
            "totalScore": total_score,
            "rank": 0,
            "recommended": False,
            "tradingDays": trading_days,
            "categories": categories,
        })

    # 카테고리별 순위
    cat_keys = ["profitability", "riskAdjusted", "defense", "consistency", "efficiency", "validation"]
    for key in cat_keys:
        ranks = _assign_ranks([sc["categories"][key]["score"] for sc in scorecards])
        for j, sc in enumerate(scorecards):
            sc["categories"][key]["rank"] = ranks[j]

    # 총점 순위 + 최소 데이터 기간 체크 (#48)
    MIN_TRADING_DAYS = 10
    total_ranks = _assign_ranks([sc["totalScore"] for sc in scorecards])
    for j, sc in enumerate(scorecards):
        sc["rank"] = total_ranks[j]
        has_enough_data = sc.get("tradingDays", 0) >= MIN_TRADING_DAYS
        sc["recommended"] = total_ranks[j] <= 3 and has_enough_data
        if not has_enough_data:
            sc["dataWarning"] = f"데이터 {sc.get('tradingDays', 0)}일 — 추천 보류"

    # 순위순 정렬
    scorecards.sort(key=lambda sc: sc["rank"])

    return scorecards


if __name__ == "__main__":
    import json
    cards = compute_scorecards()
    for card in cards:
        rec = " ⭐" if card["recommended"] else ""
        print(f"#{card['rank']} {card['investor']} ({card['investorId']}): {card['totalScore']}점{rec}")
    print(f"\n전체 데이터:")
    print(json.dumps(cards[:3], ensure_ascii=False, indent=2))
