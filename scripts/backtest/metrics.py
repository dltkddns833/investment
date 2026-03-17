"""백테스트 성과 지표 계산"""
import math


def compute_metrics(daily_assets, initial_capital, transactions=None, risk_free_rate=0.035):
    """일별 자산 목록에서 성과 지표 계산

    Args:
        daily_assets: [(date_str, total_asset), ...] 시간순 정렬
        initial_capital: 초기 자본
        transactions: [{"type": "sell", "profit": int}, ...] (승률 계산용)
        risk_free_rate: 무위험 수익률 (연, 기본 3.5%)

    Returns:
        dict with metrics
    """
    if len(daily_assets) < 2:
        return _empty_metrics()

    assets = [a[1] for a in daily_assets]
    trading_days = len(assets)

    # 일별 수익률
    daily_returns = []
    for i in range(1, len(assets)):
        if assets[i - 1] > 0:
            daily_returns.append(assets[i] / assets[i - 1] - 1)
        else:
            daily_returns.append(0)

    # 누적 수익률
    cumulative_return_pct = round((assets[-1] / initial_capital - 1) * 100, 2)

    # 연환산 수익률
    years = trading_days / 252
    if years > 0 and assets[-1] > 0 and initial_capital > 0:
        annualized_return = (assets[-1] / initial_capital) ** (1 / years) - 1
        annualized_return_pct = round(annualized_return * 100, 2)
    else:
        annualized_return = 0
        annualized_return_pct = 0

    # 변동성 (연환산)
    if daily_returns:
        mean_r = sum(daily_returns) / len(daily_returns)
        variance = sum((r - mean_r) ** 2 for r in daily_returns) / len(daily_returns)
        daily_vol = math.sqrt(variance)
        volatility_pct = round(daily_vol * math.sqrt(252) * 100, 2)
    else:
        daily_vol = 0
        volatility_pct = 0

    # 샤프 비율
    daily_rf = risk_free_rate / 252
    if daily_vol > 0:
        excess_returns = [r - daily_rf for r in daily_returns]
        mean_excess = sum(excess_returns) / len(excess_returns)
        sharpe_ratio = round(mean_excess / daily_vol * math.sqrt(252), 2)
    else:
        sharpe_ratio = 0

    # MDD
    peak = assets[0]
    max_drawdown = 0
    max_drawdown_duration = 0
    current_drawdown_start = 0

    for i, asset in enumerate(assets):
        if asset > peak:
            peak = asset
            current_drawdown_start = i
        drawdown = (asset - peak) / peak
        if drawdown < max_drawdown:
            max_drawdown = drawdown
            max_drawdown_duration = i - current_drawdown_start

    mdd_pct = round(max_drawdown * 100, 2)

    # 최고/최저 일간 수익률
    best_day_pct = round(max(daily_returns) * 100, 2) if daily_returns else 0
    worst_day_pct = round(min(daily_returns) * 100, 2) if daily_returns else 0

    # 승률 (수익 거래 / 전체 매도 거래)
    win_rate_pct = 0
    if transactions:
        sells = [t for t in transactions if t.get("type") == "sell" and "profit" in t]
        if sells:
            wins = sum(1 for t in sells if t["profit"] > 0)
            win_rate_pct = round(wins / len(sells) * 100, 1)

    return {
        "cumulative_return_pct": cumulative_return_pct,
        "annualized_return_pct": annualized_return_pct,
        "sharpe_ratio": sharpe_ratio,
        "mdd_pct": mdd_pct,
        "max_drawdown_duration_days": max_drawdown_duration,
        "volatility_pct": volatility_pct,
        "win_rate_pct": win_rate_pct,
        "best_day_pct": best_day_pct,
        "worst_day_pct": worst_day_pct,
        "trading_days": trading_days,
    }


def _empty_metrics():
    return {
        "cumulative_return_pct": 0,
        "annualized_return_pct": 0,
        "sharpe_ratio": 0,
        "mdd_pct": 0,
        "max_drawdown_duration_days": 0,
        "volatility_pct": 0,
        "win_rate_pct": 0,
        "best_day_pct": 0,
        "worst_day_pct": 0,
        "trading_days": 0,
    }
