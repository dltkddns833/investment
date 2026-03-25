"""14개 투자자별 결정론적 배분 전략

각 함수는 (price_df, date, universe_map, **kwargs) -> dict[ticker, weight] 를 반환한다.
universe_map: {ticker: {"name", "sector", "market_cap_tier", "dividend_yield", ...}}
"""
from .historical_indicators import (
    compute_momentum,
    compute_technical_signals,
    compute_market_regime,
    compute_sector_returns,
)


def _equal_weight(tickers, total_weight=1.0):
    """균등 배분"""
    if not tickers:
        return {}
    w = round(total_weight / len(tickers), 4)
    return {t: w for t in tickers}


def _is_etf(info):
    """ETF 여부 판별 (sector에 'ETF' 포함)"""
    return "ETF" in info.get("sector", "")


def _top_n_by_key(data, key, n, reverse=True):
    """data dict에서 key 기준 상위 n개 티커 반환"""
    sorted_items = sorted(data.items(), key=lambda x: x[1].get(key, 0), reverse=reverse)
    return [t for t, _ in sorted_items[:n]]


# ============================================================
# A 강돌진: 공격적 모멘텀 / 5~8종목 집중
# ============================================================
def strategy_A(price_df, date, universe_map, **kwargs):
    momentum = compute_momentum(price_df, date, universe_map)
    top = _top_n_by_key(momentum, "return_1w", 6)
    return _equal_weight(top)


# ============================================================
# B 김균형: 균형 분산 / 섹터별 1종목씩, 10~15종목
# ============================================================
def strategy_B(price_df, date, universe_map, **kwargs):
    momentum = compute_momentum(price_df, date, universe_map)
    sectors = compute_sector_returns(price_df, date, universe_map)

    picks = []
    for sector, data in sectors.items():
        # 섹터 내 모멘텀 상위 1종목
        sector_tickers = [t for t in data["tickers"] if t in momentum]
        if sector_tickers:
            best = max(sector_tickers, key=lambda t: momentum[t].get("return_1w", 0))
            picks.append(best)

    return _equal_weight(picks[:15])


# ============================================================
# C 이든든: 보수적 우량주 / 저변동 대형주 5~10종목
# ============================================================
def strategy_C(price_df, date, universe_map, **kwargs):
    import pandas as pd

    ts = pd.Timestamp(date)
    scores = {}

    for ticker, info in universe_map.items():
        if _is_etf(info):
            continue
        try:
            closes = price_df[("Close", ticker)][:ts].dropna()
            if len(closes) < 20:
                continue
            # 저변동성 = 안정성
            vol = float(closes.pct_change().tail(20).std())
            # 점수: 낮은 변동성
            score = -vol * 100
            scores[ticker] = {"score": score}
        except Exception:
            continue

    top = _top_n_by_key(scores, "score", 8)
    return _equal_weight(top)


# ============================================================
# D 장반대: 역발상 / 낙폭 과대 5~8종목
# ============================================================
def strategy_D(price_df, date, universe_map, **kwargs):
    momentum = compute_momentum(price_df, date, universe_map)
    # 1주 수익률 하위 (낙폭 과대)
    bottom = _top_n_by_key(momentum, "return_1w", 6, reverse=False)
    return _equal_weight(bottom)


# ============================================================
# E 정기준: 동일 가중 벤치마크 / 전 종목 1/N
# ============================================================
def strategy_E(price_df, date, universe_map, **kwargs):
    import pandas as pd

    ts = pd.Timestamp(date)
    # 가격 데이터 있는 종목만
    available = []
    for ticker in universe_map:
        try:
            closes = price_df[("Close", ticker)][:ts].dropna()
            if len(closes) >= 1:
                available.append(ticker)
        except Exception:
            continue
    return _equal_weight(available)


# ============================================================
# F 윤순환: 섹터 로테이션 / 상위 2~3섹터 집중
# ============================================================
def strategy_F(price_df, date, universe_map, **kwargs):
    sectors = compute_sector_returns(price_df, date, universe_map)
    momentum = compute_momentum(price_df, date, universe_map)

    # 상위 3섹터
    sorted_sectors = sorted(sectors.items(), key=lambda x: x[1]["avg_return_1w"], reverse=True)
    top_sectors = sorted_sectors[:3]

    picks = []
    for sector, data in top_sectors:
        sector_tickers = [t for t in data["tickers"] if t in momentum]
        # 섹터 내 상위 2종목
        sector_tickers.sort(key=lambda t: momentum[t].get("return_1w", 0), reverse=True)
        picks.extend(sector_tickers[:2])

    return _equal_weight(picks)


# ============================================================
# G 문여론: 뉴스 감성 프록시 (5일 수익률 방향) / 5~10종목
# ============================================================
def strategy_G(price_df, date, universe_map, **kwargs):
    momentum = compute_momentum(price_df, date, universe_map)
    # 5일 수익률 양수 = 긍정 감성 프록시
    positive = {t: d for t, d in momentum.items() if d.get("return_1w", 0) > 0}
    top = _top_n_by_key(positive, "return_1w", 8)
    return _equal_weight(top)


# ============================================================
# H 박기술: 기술적 분석 / RSI 과매도 + MACD 매수 신호
# ============================================================
def strategy_H(price_df, date, universe_map, **kwargs):
    signals = compute_technical_signals(price_df, date)
    candidates = []

    for ticker, s in signals.items():
        if ticker not in universe_map:
            continue
        score = 0
        # RSI 과매도 우선
        if s["rsi_signal"] == "oversold":
            score += 3
        elif s["rsi"] is not None and s["rsi"] < 40:
            score += 1
        # MACD 매수 신호
        if s["macd_signal"] in ("bullish_cross", "bullish"):
            score += 2
        # BB 하단
        if s["bb_signal"] == "lower_band":
            score += 1
        # 상승 추세
        if s["trend"] == "uptrend":
            score += 1
        # 과매수 회피
        if s["rsi_signal"] == "overbought":
            score -= 3

        if score >= 2:
            candidates.append((ticker, score))

    candidates.sort(key=lambda x: x[1], reverse=True)
    picks = [t for t, _ in candidates[:7]]

    if not picks:
        # fallback: 모멘텀 상위
        momentum = compute_momentum(price_df, date, universe_map)
        picks = _top_n_by_key(momentum, "return_1w", 5)

    return _equal_weight(picks)


# ============================================================
# I 최배당: 배당 투자 / 저변동 대형 안정주 5~10종목
# (과거 배당수익률 데이터가 없으므로 안정성+금융/통신/에너지 섹터 선호)
# ============================================================
def strategy_I(price_df, date, universe_map, **kwargs):
    import pandas as pd
    ts = pd.Timestamp(date)

    # 배당 선호 섹터
    div_sectors = {"금융", "보험", "통신", "에너지/화학", "철강", "건설", "식품"}
    scores = {}

    for ticker, info in universe_map.items():
        if _is_etf(info):
            continue
        try:
            closes = price_df[("Close", ticker)][:ts].dropna()
            if len(closes) < 20:
                continue
            vol = float(closes.pct_change().tail(20).std())
            sector_bonus = 5 if info.get("sector") in div_sectors else 0
            score = -vol * 100 + sector_bonus
            scores[ticker] = {"score": score}
        except Exception:
            continue

    top = _top_n_by_key(scores, "score", 8)
    return _equal_weight(top)


# ============================================================
# J 한따라: 수급 추종 프록시 (거래량 급증) / 5~8종목
# ============================================================
def strategy_J(price_df, date, universe_map, **kwargs):
    momentum = compute_momentum(price_df, date, universe_map)
    # 거래량 급증 = 기관/외국인 매수 프록시
    surge = {t: d for t, d in momentum.items() if d.get("volume_surge", False)}
    if len(surge) >= 3:
        top = _top_n_by_key(surge, "volume_ratio", 7)
    else:
        # fallback: 거래량 비율 상위
        top = _top_n_by_key(momentum, "volume_ratio", 7)
    return _equal_weight(top)


# ============================================================
# K 로로캅: ETF 전용 글로벌 자산배분 / 4~8종목
# ============================================================
def strategy_K(price_df, date, universe_map, **kwargs):
    regime = compute_market_regime(price_df, date)["regime"]

    etf_tickers = [t for t, info in universe_map.items() if _is_etf(info)]
    if not etf_tickers:
        return {}

    # 카테고리 분류 (sector 필드 사용)
    categories = {}
    for ticker in etf_tickers:
        info = universe_map[ticker]
        cat = info.get("sector", "기타")
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(ticker)

    # 레짐에 따라 채권/주식 비중 조절
    if regime == "bear":
        bond_weight = 0.4
    elif regime == "neutral":
        bond_weight = 0.25
    else:
        bond_weight = 0.1

    equity_weight = 1.0 - bond_weight

    allocation = {}
    bond_tickers = []
    equity_tickers = []
    for cat, tickers in categories.items():
        if "채권" in cat or "단기채" in cat:
            bond_tickers.extend(tickers)
        else:
            equity_tickers.extend(tickers)

    if bond_tickers:
        bw = round(bond_weight / len(bond_tickers), 4)
        for t in bond_tickers:
            allocation[t] = bw
    if equity_tickers:
        ew = round(equity_weight / len(equity_tickers), 4)
        for t in equity_tickers:
            allocation[t] = ew

    return allocation


# ============================================================
# L 신장모: 분할매도 전략 / 코스닥 성장주 5~8종목 (신규 진입만)
# ============================================================
def strategy_L(price_df, date, universe_map, **kwargs):
    momentum = compute_momentum(price_df, date, universe_map)
    # 코스닥 (.KQ) 종목 우선
    kosdaq = {t: d for t, d in momentum.items()
              if t.endswith(".KQ") and t in universe_map}
    if len(kosdaq) < 3:
        kosdaq = momentum  # fallback

    top = _top_n_by_key(kosdaq, "return_1w", 6)
    return _equal_weight(top)


# ============================================================
# M 오판단: 마켓 타이밍 / 레짐별 현금비중 조절
# ============================================================
def strategy_M(price_df, date, universe_map, **kwargs):
    regime = compute_market_regime(price_df, date)["regime"]
    momentum = compute_momentum(price_df, date, universe_map)

    # 레짐별 투자 비중 (나머지는 현금)
    if regime == "bull":
        invest_ratio = 0.9
    elif regime == "neutral":
        invest_ratio = 0.5
    else:
        invest_ratio = 0.3

    # 모멘텀 상위 종목에 배분
    n = max(3, min(8, int(len(momentum) * 0.1)))
    top = _top_n_by_key(momentum, "return_1w", n)

    if not top:
        return {}

    per_stock = round(invest_ratio / len(top), 4)
    return {t: per_stock for t in top}


# ============================================================
# N 전몰빵: 집중투자 / 2~3종목 올인
# ============================================================
def strategy_N(price_df, date, universe_map, **kwargs):
    import pandas as pd

    momentum = compute_momentum(price_df, date, universe_map)
    ts = pd.Timestamp(date)

    # 3중 필터: 모멘텀 + 저변동(품질) + 거래량(수급)
    scores = {}
    for ticker, m_data in momentum.items():
        if ticker not in universe_map:
            continue
        try:
            closes = price_df[("Close", ticker)][:ts].dropna()
            if len(closes) < 20:
                continue

            vol = float(closes.pct_change().tail(20).std()) * 100
            momentum_score = m_data.get("return_1w", 0)
            quality_score = -vol  # 낮은 변동성 = 높은 품질
            flow_score = m_data.get("volume_ratio", 1)

            # 종합 점수
            total = momentum_score + quality_score * 2 + flow_score * 3
            scores[ticker] = {"total": total}
        except Exception:
            continue

    top = _top_n_by_key(scores, "total", 3)
    return _equal_weight(top)


# ============================================================
# O 정익절: 단기 스윙 수익실현 / 모멘텀 상위 5~8종목 (신규 진입만)
# +5% 전량 익절, -3% 전량 손절은 engine.py에서 check_target_prices()로 처리
# ============================================================
def strategy_O(price_df, date, universe_map, **kwargs):
    momentum = compute_momentum(price_df, date, universe_map)
    # 전 종목 대상 (L과 달리 KOSDAQ 제한 없음), 모멘텀 상위 6종목
    top = _top_n_by_key(momentum, "return_1w", 6)
    return _equal_weight(top)


# ============================================================
# 전략 매핑
# ============================================================
STRATEGY_MAP = {
    "A": strategy_A,
    "B": strategy_B,
    "C": strategy_C,
    "D": strategy_D,
    "E": strategy_E,
    "F": strategy_F,
    "G": strategy_G,
    "H": strategy_H,
    "I": strategy_I,
    "J": strategy_J,
    "K": strategy_K,
    "L": strategy_L,
    "M": strategy_M,
    "N": strategy_N,
    "O": strategy_O,
}


def get_strategy(investor_id):
    """투자자 ID에 해당하는 배분 함수 반환"""
    return STRATEGY_MAP.get(investor_id)
