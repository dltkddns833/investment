"""Q 정채원 장중 1분 상시 스캔 스캘핑 모니터링

이슈 #57 Q 정채원 전략 (2026-05-08 v4 — 5/8 4종목 분석 반영, 초단기 시그널 전환):
  - 10:00 ~ 14:50 동안 1분 간격으로 KIS 등락률 순위 상시 스캔
    (9시대 fallback 폐기 — 분봉 비교 불가 + 0승 2패 데이터)
  - 종목 선정 (점프 감지 + 1분봉 단기 시그널, v3 게이트 폐기):
      1) 매분 등락률 순위 호출 → 직전 분 대비 등락률 점프 ≥ +2%p 후보만 추림 (보통 0~3개)
         · cold start (장 시작/재기동 직후 1회): 등락률 ≥ +2% 전 종목 폴백
      2) 전일 종가 ≥ 2,000원, 현재 등락률 ≤ +15% (고속 락 종목 회피)
      3) 1분봉 6개 호출 → 직전 1분 거래량 / 직전 5분 평균 ≥ 3배 AND
         직전 1분 등락 ≥ +2% 동시 충족
      4) 5분 평균 거래량 < 1,000주는 휴면 종목으로 판정 → 무시
  - 매수 후 30분 모니터링: 30초 간격 가격 체크 (HOLDING 한정, IDLE 스캔은 1분)
  - 손절: 매수가 대비 -3% (즉시 청산)
  - 익절: 트레일링 — 매수가 대비 +3% 도달 시 활성화 → 고점 대비 -1% 되돌림 시 청산
  - 강제 청산: 매수+30분 (익절/손절 미발동 시)
  - 동시 보유 1종목 (HOLDING 중에는 신규 스캔 스킵)
  - 당일 재매수 금지 (매도 후 같은 종목 재진입 차단)
  - **일일 매매 한도 8회** (8회째 BUY 이후 추가 진입 차단)
  - **연패 쿨다운**: 직전 3사이클 모두 손실(<0%)이면 1시간 진입 차단
  - **레짐 게이트**:
      · bear 레짐 → 신규 진입 자체 차단 (HOLDING 중이면 청산 후 종료)
      · 그 외 → 단기 시그널 그대로 적용 (v3 약세 ×2 multiplier 폐기 — v4는 단기 자체가 강한 필터)
  - 자본: 복리 + 1,000만원 캡 (캡 초과분은 현금으로 보유)
  - 종목 범위: KOSPI + KOSDAQ 전체 (stock_universe 무관)

Usage:
    python3 scripts/core/q_monitor.py              # 실행
    python3 scripts/core/q_monitor.py --dry-run     # 매매 없이 로그만
"""
import sys
import time
import argparse
from datetime import datetime, date, timedelta, timezone
from pathlib import Path

import holidays

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "notifications"))

from supabase_client import supabase
from portfolio import load_portfolio, load_profile, save_portfolio, evaluate, calc_fees
from broker_client import KISClient
from safety import check_kill_switch
from daily_pipeline import notify, notify_monitor
from logger import get_logger

logger = get_logger("q_monitor")

INVESTOR_ID = "Q"
STOP_LOSS_PCT = -3.0            # 매수가 대비 -3% 손절
TRAILING_ACTIVATE_PCT = 3.0     # +3% 도달 시 트레일링 활성화 (05-06 backtest: 5→3, peak 분포 평균 +2.6%)
TRAILING_PULLBACK_PCT = 1.0     # 활성화 후 고점 대비 -1% 되돌림 시 청산
MAX_CAPITAL_PER_TRADE = 10_000_000  # 매수당 자본 캡
MIN_PREV_CLOSE = 2000           # 전일 종가 2,000원 미만 제외

# 1분 상시 스캔 윈도우
# 09:00~09:59는 분봉 비교 불가하여 진입 불가, 10:00부터 시도 (09시 fallback 폐기)
SCAN_START_HH = 10              # 10:00 스캔 시작
SCAN_START_MM = 0
SCAN_END_HH = 14                # 14:50 스캔 종료 (매수 후 30분 강제 청산 윈도우 보장)
SCAN_END_MM = 50
HOLD_DURATION_MIN = 30          # 매수 후 보유 시간 (강제 청산 시각 = buy_dt + 30분)
SCAN_INTERVAL_MIN = 1           # IDLE 스캔 주기
HOLD_INTERVAL_SEC = 30          # HOLDING 가격 체크 주기

# 초단기 시그널 파라미터 (v4 — 5/8 4종목 분석 반영)
# 1차 narrow: 매분 등락률 순위에서 직전 분 대비 점프 종목 추림
JUMP_DETECT_PCT = 2.0           # 직전 분 대비 등락률 점프 ≥ +2%p (점프 감지)
COLD_START_RATE_MIN = 2.0       # cold start 시 등락률 ≥ +2% 전 종목 폴백
RATE_MAX_FOR_ENTRY = 15.0       # 현재 등락률 > 15%면 진입 차단 (고속 락 회피)
# 2차 confirm: 1분봉 6개로 단기 시그널 검증
MIN_5MA_VOLUME = 1000           # 직전 5분 평균 거래량 < 1,000주는 휴면 종목으로 무시
VOL_5MA_RATIO_MIN = 3.0         # 직전 1분 거래량 / 직전 5분 평균 ≥ 3배
RATE_1M_MIN = 2.0               # 직전 1분 등락 ≥ +2%

# 일일 매매 한도 + 연패 쿨다운 + 레짐 게이트
DAILY_TRADE_LIMIT = 8           # 일일 BUY 횟수 한도 (8회 도달 시 추가 진입 차단)
LOSS_STREAK_THRESHOLD = 3       # 직전 N사이클 모두 손실이면 쿨다운 발동
COOLDOWN_MINUTES = 60           # 연패 쿨다운 시간 (분)
BEAR_BLOCK_ENTRY = True         # bear 레짐 시 신규 진입 차단 (05-06 backtest: 5/6 약세 휩쏘 손실 대응)
# v3의 WEAK_REGIME_MULTIPLIER는 v4에서 폐기 — 단기 시그널 자체가 강한 필터라 추가 게이트 불필요

# 등락률 순위 호출 시 1차 후보 풀 사이즈 (점프 감지용 base universe)
SURGE_RANKING_POOL_SIZE = 50

KR_HOLIDAYS = holidays.KR()


# --- 시간 유틸 ---

def prev_business_day(today):
    """전 거래일 (KR 공휴일 + 주말 제외)"""
    d = today - timedelta(days=1)
    while d.weekday() >= 5 or d in KR_HOLIDAYS:
        d -= timedelta(days=1)
    return d


def is_business_day(d):
    return d.weekday() < 5 and d not in KR_HOLIDAYS


def wait_until(target_dt, label=""):
    """목표 시각까지 sleep (60초마다 깨어나 킬스위치 체크)"""
    now = datetime.now()
    if target_dt <= now:
        return True
    while datetime.now() < target_dt:
        if check_kill_switch():
            logger.warning(f"킬스위치 활성화 ({label}) — 대기 중단")
            return False
        remaining = (target_dt - datetime.now()).total_seconds()
        time.sleep(min(60, max(1, remaining)))
    return True


# --- 티커 변환 ---

def kis_to_yf_ticker(code, market_name=""):
    """KIS 6자리 코드 → yfinance 형식. market_name=rprs_mrkt_kor_name"""
    if not market_name:
        return f"{code}.KS"
    upper = market_name.upper()
    if "KSQ" in upper or "KOSDAQ" in upper:
        return f"{code}.KQ"
    return f"{code}.KS"


def _pykrx_name(code):
    """pykrx로 한글 종목명 조회 (KIS 이름 응답 실패 시 fallback)"""
    try:
        from pykrx import stock as pykrx_stock
        name = pykrx_stock.get_market_ticker_name(code)
        return name if name else ""
    except Exception:
        return ""


def fetch_market_name(client, code):
    """KIS 현재가 응답에서 rprs_mrkt_kor_name 직접 조회. 이름 없으면 pykrx fallback.

    KIS·pykrx 둘 다 실패 시 빈 문자열을 반환한다 (code 자체를 이름으로 쓰지 않음).
    호출자는 name_hint(등락률 순위 응답의 hts_kor_isnm 등)로 폴백할 것.
    """
    import requests
    url = f"{client.base_url}/uapi/domestic-stock/v1/quotations/inquire-price"
    params = {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": code}
    resp = requests.get(url, headers=client._headers("FHKST01010100"), params=params, timeout=10)
    data = resp.json()
    o = data.get("output", {})
    market_name = o.get("rprs_mrkt_kor_name", "")
    kis_name = o.get("hts_kor_isnm", "")
    price = int(o.get("stck_prpr", 0))
    if not kis_name or kis_name == code:
        kis_name = _pykrx_name(code)  # 실패 시 "" 반환
    return market_name, kis_name, price


# --- 레짐 게이트 ---

def get_regime_block(today):
    """오늘(또는 직전 영업일) 마켓 레짐을 조회해 진입 차단 여부 판정.

    Returns: (regime_label, block_entry)
      - bear 레짐 → block_entry=True (신규 진입 차단)
      - 그 외(혹은 조회 실패) → 차단 없음
    (v4: WEAK_REGIME_MULTIPLIER 폐기. 단기 시그널 자체가 강한 필터.)
    """
    try:
        rows = supabase.table("market_regimes").select("regime,bull_score").eq(
            "date", today.isoformat()
        ).execute().data
        if not rows:
            yday = prev_business_day(today)
            rows = supabase.table("market_regimes").select("regime,bull_score").eq(
                "date", yday.isoformat()
            ).execute().data
        if not rows:
            return "unknown", False
        r = rows[0]
        regime = r.get("regime") or ""
        score = r.get("bull_score") or 0
        if BEAR_BLOCK_ENTRY and regime == "bear":
            return f"{regime} (bull_score={score}) → 신규 진입 차단", True
        return f"{regime} (bull_score={score})", False
    except Exception as e:
        logger.warning(f"레짐 조회 실패 — 차단 없음: {e}")
        return "error", False


# --- 종목 선정 (v4 — 점프 감지 + 1분봉 단기 시그널) ---

def fetch_surge_ranking(client):
    """현재 KIS 등락률 순위 풀을 dict({code: change_pct, price, name}) 로 반환.

    음전(<0%)은 자동 제외되며, 9시대 운영 시작 시점에는 cold start universe로 활용.
    실패 시 빈 dict.
    """
    try:
        rows = client.get_surge_stocks(
            rate_min=COLD_START_RATE_MIN, rate_max=RATE_MAX_FOR_ENTRY,
            min_volume=100000, max_count=SURGE_RANKING_POOL_SIZE, exclude_special=True,
        )
    except Exception as e:
        logger.warning(f"  등락률 순위 조회 실패: {e}")
        return {}
    return {r["code"]: r for r in rows if r.get("code")}


def detect_jump_candidates(prev_ranking, curr_ranking, jump_pct=JUMP_DETECT_PCT):
    """직전 분 ranking 대비 등락률 점프 ≥ jump_pct%p 종목만 추림.

    prev_ranking이 비어있으면 cold start로 간주, curr_ranking 전체를 후보로 반환.
    Returns: list of candidate dicts (각 dict에 'jump_pct' 키 추가)
    """
    if not prev_ranking:
        # cold start: 첫 스캔(또는 ranking 조회 실패 후 복귀) → 등락률 ≥ COLD_START_RATE_MIN 전 종목
        return [
            {**c, "jump_pct": None, "is_cold_start": True}
            for c in curr_ranking.values()
        ]

    jumpers = []
    for code, c in curr_ranking.items():
        prev = prev_ranking.get(code)
        prev_rate = prev.get("change_pct", 0) if prev else 0
        # 직전에 ranking에 없던 신규 등장은 prev_rate=0으로 비교 (점프로 처리)
        curr_rate = c.get("change_pct", 0)
        delta = curr_rate - prev_rate
        if delta >= jump_pct:
            jumpers.append({**c, "jump_pct": delta, "is_cold_start": False})
    return jumpers


def confirm_short_term_signal(client, code, today_str):
    """1분봉 6개를 받아 단기 시그널 확인.

    조건 (모두 충족):
      - 직전 5분 평균 거래량 ≥ MIN_5MA_VOLUME (휴면 종목 차단)
      - 직전 1분 거래량 / 직전 5분 평균 ≥ VOL_5MA_RATIO_MIN
      - 직전 1분 등락률 ≥ RATE_1M_MIN

    Returns: dict({"ok": bool, "vol_ratio": float, "rate_1m": float, "avg5_vol": int}) 또는 실패 시 None
    """
    try:
        # 한 호출당 120 봉. 현재 시각 기준 include_past='Y'로 가장 최근 분봉 조회
        # hour_str은 현재 시각으로 설정해서 가장 최근 데이터 받음
        now_hhmm = datetime.now().strftime("%H%M00")
        bars = client.get_minute_chart(code, today_str.replace("-", ""), hour_str=now_hhmm, include_past="Y")
    except Exception as e:
        logger.debug(f"    1분봉 조회 실패 ({code}): {e}")
        return None

    if not bars or len(bars) < 6:
        return None

    bars.sort(key=lambda b: b.get("time", ""))
    recent6 = bars[-6:]  # 직전 5분 + 현재(직전) 1분
    prev5 = recent6[:5]
    last = recent6[5]
    avg5_vol = sum(b.get("volume", 0) for b in prev5) / 5 if prev5 else 0
    last_vol = last.get("volume", 0)

    if avg5_vol < MIN_5MA_VOLUME:
        return {"ok": False, "reason": "휴면(5MA<1k)", "avg5_vol": int(avg5_vol)}

    vol_ratio = last_vol / avg5_vol if avg5_vol > 0 else 0
    prev_close = recent6[-2].get("close", 0)
    last_close = last.get("close", 0)
    rate_1m = (last_close / prev_close - 1) * 100 if prev_close else 0

    ok = vol_ratio >= VOL_5MA_RATIO_MIN and rate_1m >= RATE_1M_MIN
    return {
        "ok": ok,
        "vol_ratio": vol_ratio,
        "rate_1m": rate_1m,
        "avg5_vol": int(avg5_vol),
        "last_vol": int(last_vol),
    }


def pick_short_term_signal(client, now_dt, today, prev_ranking, exclude_codes=None):
    """v4 종목 선정 — 점프 감지 + 1분봉 단기 시그널.

    Returns: (best_candidate_dict, curr_ranking)
      - best_candidate_dict: 매수 후보 (실패 시 None)
      - curr_ranking: 다음 분에서 점프 비교용으로 호출자가 보관할 ranking
    """
    exclude_codes = exclude_codes or set()

    # 9시대는 분봉 부족 — 진입 안 함
    if now_dt.hour < 10:
        return None, prev_ranking

    curr_ranking = fetch_surge_ranking(client)
    if not curr_ranking:
        return None, prev_ranking

    # 1차: 점프 감지로 후보 추림
    jumpers = detect_jump_candidates(prev_ranking, curr_ranking)
    cold_start = bool(jumpers and jumpers[0].get("is_cold_start"))
    # 제외 종목 + 가격 필터 + 등락률 상한
    filtered = []
    for c in jumpers:
        if c["code"] in exclude_codes:
            continue
        rate = c.get("change_pct", 0)
        if rate > RATE_MAX_FOR_ENTRY:
            continue
        cur_price = c.get("price", 0)
        prev_close = cur_price / (1 + rate / 100) if rate > -100 else 0
        if prev_close < MIN_PREV_CLOSE:
            continue
        c["prev_close_est"] = int(prev_close)
        filtered.append(c)

    if not filtered:
        if cold_start:
            logger.info(f"  [스캔 {now_dt.strftime('%H:%M')}] cold start 후보 0개")
        else:
            logger.info(f"  [스캔 {now_dt.strftime('%H:%M')}] 점프 종목 0개")
        return None, curr_ranking

    label = "cold start" if cold_start else f"점프 {len(filtered)}개"
    logger.info(
        f"  [스캔 {now_dt.strftime('%H:%M')}] {label} → 1분봉 시그널 검증"
    )

    # 2차: 1분봉 시그널 검증
    today_str = today.strftime("%Y%m%d")
    qualified = []
    for c in filtered:
        sig = confirm_short_term_signal(client, c["code"], today_str)
        if not sig:
            continue
        if not sig["ok"]:
            reason = sig.get("reason") or (
                f"vol {sig['vol_ratio']:.2f}x, 1m {sig['rate_1m']:+.2f}%"
            )
            logger.info(f"    {c.get('name','?')}({c['code']}) 통과 실패 — {reason}")
            continue
        c.update(sig)
        qualified.append(c)
        logger.info(
            f"    ★ {c['name']}({c['code']}) {c.get('change_pct',0):+.1f}% "
            f"jump {c.get('jump_pct'):+.2f}p · 1m {sig['rate_1m']:+.2f}% · "
            f"vol {sig['vol_ratio']:.2f}x (last {sig['last_vol']:,}/avg5 {sig['avg5_vol']:,})"
        )

    if not qualified:
        return None, curr_ranking

    # 시그널 강도(vol_ratio)로 정렬 → 1순위 선정
    qualified.sort(key=lambda c: c["vol_ratio"], reverse=True)
    best = qualified[0]
    logger.info(
        f"  선정: {best['name']}({best['code']}) "
        f"{best.get('change_pct', 0):+.1f}%, 1m {best['rate_1m']:+.2f}%, "
        f"vol {best['vol_ratio']:.2f}x"
    )
    return best, curr_ranking


# --- 매매 실행 ---

def execute_buy(client, code, name_hint, today_str, dry_run=False):
    """시장가 매수 — capital = min(cash, 1,000만원). holdings에 1종목만 보유.
    Returns: (ticker, name, exec_price, shares) 또는 None
    """
    portfolio = load_portfolio(INVESTOR_ID)
    cash = portfolio["cash"]
    capital = min(cash, MAX_CAPITAL_PER_TRADE)

    # 시장구분 + 종목명 + 현재가 조회 (1회)
    try:
        market_name, kis_name, current_price = fetch_market_name(client, code)
    except Exception as e:
        logger.warning(f"  현재가 조회 실패: {e}")
        return None

    if current_price <= 0:
        logger.warning(f"  현재가 0 — 매수 스킵")
        return None

    # 종목명: KIS 현재가 응답 → 등락률 순위에서 받은 name_hint → pykrx 한 번 더 시도 → 최후엔 code
    name = kis_name or name_hint or _pykrx_name(code) or code
    if name == code:
        logger.warning(f"  종목명 조회 실패 — code({code})를 name으로 사용")
    ticker = kis_to_yf_ticker(code, market_name)

    # 슬리피지 반영 체결가 추정 + 매수 수량
    exec_price_est, _ = calc_fees(ticker, current_price, 1, "buy")
    shares = capital // exec_price_est
    if shares <= 0:
        logger.warning(f"  매수 수량 0 — 자본 부족 ({capital:,}원, 체결가 {exec_price_est:,}원)")
        return None

    # 실제 fee 재계산
    exec_price, fee = calc_fees(ticker, current_price, shares, "buy")
    cost = shares * exec_price
    total_cost = cost + fee
    if total_cost > cash:
        # 자본 캡 또는 현금 부족 → 1주씩 줄여 재시도
        while shares > 0:
            shares -= 1
            exec_price, fee = calc_fees(ticker, current_price, shares, "buy")
            cost = shares * exec_price
            total_cost = cost + fee
            if total_cost <= cash:
                break
    if shares <= 0:
        logger.warning(f"  매수 불가 — 현금 부족")
        return None

    if dry_run:
        logger.info(f"  [dry-run] BUY {name}({code}) {shares}주 × {exec_price:,}원 = {cost:,}원")
        return ticker, name, exec_price, shares

    # 실거래
    portfolio["cash"] = cash - total_cost
    portfolio["holdings"][ticker] = {
        "name": name,
        "shares": shares,
        "avg_price": exec_price,
    }
    supabase.table("transactions").insert({
        "investor_id": INVESTOR_ID, "date": today_str, "type": "buy",
        "ticker": ticker, "name": name, "shares": shares,
        "price": exec_price, "amount": cost, "fee": fee,
        "executed_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    # 종목명 영구 캐시 (stock_universe 외부 종목 이름 보존)
    market = "KOSPI" if ticker.endswith(".KS") else "KOSDAQ"
    supabase.table("stock_names").upsert(
        {"ticker": ticker, "name": name, "market": market, "updated_at": "now()"},
        on_conflict="ticker",
    ).execute()
    save_portfolio(INVESTOR_ID, portfolio)
    logger.info(f"  ✅ BUY {name}({ticker}) {shares}주 × {exec_price:,}원 = {cost:,}원")
    return ticker, name, exec_price, shares


def execute_sell_all(client, today_str, reason, dry_run=False):
    """현재 보유 종목 전량 매도. 시세는 KIS get_current_price로 즉시 조회.
    Returns: list of trade dicts
    """
    portfolio = load_portfolio(INVESTOR_ID)
    holdings = portfolio.get("holdings", {})
    if not holdings:
        return []

    trades = []
    pending = []
    for ticker in list(holdings.keys()):
        h = holdings[ticker]
        code = ticker.split(".")[0]
        try:
            info = client.get_current_price(code)
            current_price = info["price"]
        except Exception as e:
            logger.warning(f"  매도 시세 조회 실패 ({ticker}): {e}")
            continue
        if current_price <= 0:
            continue
        sell_shares = h["shares"]
        exec_price, fee = calc_fees(ticker, current_price, sell_shares, "sell")
        revenue = sell_shares * exec_price
        profit = (exec_price - h["avg_price"]) * sell_shares
        name = h["name"]

        if dry_run:
            pct = (exec_price / h["avg_price"] - 1) * 100
            logger.info(f"  [dry-run] SELL {name}({ticker}) {sell_shares}주 × {exec_price:,}원 ({pct:+.2f}%, {reason})")
            trades.append({"ticker": ticker, "name": name, "shares": sell_shares,
                           "price": exec_price, "profit": profit, "reason": reason})
            continue

        portfolio["cash"] += revenue - fee
        del portfolio["holdings"][ticker]
        pending.append({
            "investor_id": INVESTOR_ID, "date": today_str, "type": "sell",
            "ticker": ticker, "name": name, "shares": sell_shares,
            "price": exec_price, "amount": revenue, "fee": fee, "profit": profit,
            "executed_at": datetime.now(timezone.utc).isoformat(),
        })
        pct = (exec_price / h["avg_price"] - 1) * 100
        trades.append({"ticker": ticker, "name": name, "shares": sell_shares,
                       "price": exec_price, "profit": profit, "pct": pct, "reason": reason})
        logger.info(f"  ✅ SELL {name}({ticker}) {sell_shares}주 × {exec_price:,}원 ({pct:+.2f}%, {reason})")

    if pending and not dry_run:
        supabase.table("transactions").insert(pending).execute()
        save_portfolio(INVESTOR_ID, portfolio)
    return trades


# --- 리포트 ---

def refresh_daily_report(date_str):
    """Q 매매 후 daily_reports & portfolio_snapshots 갱신. 가격은 holdings 시세를 KIS로 즉시 조회."""
    try:
        client = KISClient()
        portfolio = load_portfolio(INVESTOR_ID)
        holdings = portfolio.get("holdings", {})
        prices = {}
        for ticker in holdings:
            code = ticker.split(".")[0]
            try:
                info = client.get_current_price(code)
                prices[ticker] = {"price": info["price"], "name": info.get("name", "")}
            except Exception:
                prices[ticker] = {"price": holdings[ticker]["avg_price"], "name": holdings[ticker]["name"]}

        result = evaluate(INVESTOR_ID, prices)
        profile = load_profile(INVESTOR_ID)

        existing = supabase.table("daily_reports").select("*").eq("date", date_str).execute().data
        if not existing:
            return
        report = existing[0]
        investor_name = result["investor"]
        prev_detail = report["investor_details"].get(investor_name, {})
        result["rebalance_frequency_days"] = profile["rebalance_frequency_days"]
        result["rebalanced_today"] = prev_detail.get("rebalanced_today", False)
        result["total_rebalances"] = prev_detail.get("total_rebalances", 0)

        txns = supabase.table("transactions").select("type,ticker,shares,price").eq(
            "investor_id", INVESTOR_ID).eq("date", date_str).execute().data or []
        result["trades_today"] = txns

        report["investor_details"][investor_name] = result

        details = list(report["investor_details"].values())
        details.sort(key=lambda x: x.get("total_return_pct", 0), reverse=True)
        rankings = []
        for i, d in enumerate(details):
            rankings.append({
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
            })

        supabase.table("daily_reports").upsert({
            "date": date_str,
            "generated_at": report["generated_at"],
            "market_prices": report["market_prices"],
            "rankings": rankings,
            "investor_details": report["investor_details"],
        }).execute()

        supabase.table("portfolio_snapshots").upsert({
            "investor_id": INVESTOR_ID,
            "date": date_str,
            "holdings": result["holdings"],
            "cash": portfolio["cash"],
            "total_asset": result["total_asset"],
            "snapshot_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        logger.info(f"  📊 daily_reports 갱신 (자산 {result['total_asset']:,}원)")
    except Exception as e:
        logger.error(f"  daily_reports 갱신 실패: {e}")


# --- 메인 (1분 상시 스캔) ---

def run_monitor(dry_run=False):
    today = date.today()
    today_str = today.isoformat()
    if not is_business_day(today):
        logger.info(f"휴장일 ({today_str}) — Q 모니터링 스킵")
        return

    client = KISClient()

    # 레짐 게이트 — 시작 시 진입 차단 여부 결정 (장중 변경 안 함)
    regime_label, block_entry = get_regime_block(today)
    logger.info(f"레짐: {regime_label}")
    if block_entry:
        logger.warning("bear 레짐 — 신규 진입 차단 (HOLDING이 없으면 즉시 종료)")

    if block_entry:
        notify_monitor(
            f"⚡ *[정채원 Q v4] 모니터링 시작* ({today_str})\n"
            f"레짐: {regime_label}\n"
            f"🛑 신규 진입 차단 — bear 레짐 휩쏘 회피\n"
            f"(dry_run={dry_run})"
        )
    else:
        notify_monitor(
            f"⚡ *[정채원 Q v4] 모니터링 시작* ({today_str})\n"
            f"레짐: {regime_label}\n"
            f"시그널: 등락률 점프 ≥ +{JUMP_DETECT_PCT:.1f}%p → "
            f"1분봉 vol ≥ {VOL_5MA_RATIO_MIN:.1f}x AND 1m ≥ +{RATE_1M_MIN:.1f}%\n"
            f"가드: 등락 ≤ +{RATE_MAX_FOR_ENTRY:.0f}%, 5MA vol ≥ {MIN_5MA_VOLUME:,}\n"
            f"한도: 일일 {DAILY_TRADE_LIMIT}회, 연패 {LOSS_STREAK_THRESHOLD}회 → "
            f"{COOLDOWN_MINUTES}분 쿨다운\n"
            f"(dry_run={dry_run})"
        )
    logger.info(f"Q 정채원 모니터링 시작 ({today_str}, dry_run={dry_run})")

    base_dt = datetime.combine(today, datetime.min.time())
    scan_start = base_dt.replace(hour=SCAN_START_HH, minute=SCAN_START_MM)
    scan_end = base_dt.replace(hour=SCAN_END_HH, minute=SCAN_END_MM)

    # 스캔 시작 시각 전이면 대기 (10:00)
    if datetime.now() < scan_start:
        logger.info(f"스캔 시작 {scan_start.strftime('%H:%M')}까지 대기")
        if not wait_until(scan_start, label="scan start"):
            return

    state = "IDLE"          # IDLE / HOLDING
    holding = None          # {"ticker","name","code","avg_price","buy_dt","hold_close_dt",
                            #  "peak_pct","trailing_active"}

    # 당일 이미 매매한 종목은 재매수 금지 + 일일 매매 한도 카운트 — 시작 시 transactions 로드
    traded_today_codes = set()
    buy_count = 0           # 오늘 BUY 횟수 (DAILY_TRADE_LIMIT 비교용)
    cycle_results = []      # 오늘 청산된 사이클의 ret_pct 리스트 (쿨다운 판단용)
    last_sell_dt = None     # 마지막 청산 시각 (쿨다운 시작점)
    cooldown_until = None   # 쿨다운 해제 시각

    try:
        existing_txs = supabase.table("transactions").select(
            "ticker,type,price,executed_at"
        ).eq("investor_id", INVESTOR_ID).eq("date", today_str).execute().data or []
        # 코드 set + buy 카운트
        # 사이클 손익 재구성 — 매수↔매도 짝짓기 (executed_at 순)
        existing_txs.sort(key=lambda x: x.get("executed_at") or "")
        prior_buy = None
        for tx in existing_txs:
            ticker = tx.get("ticker", "")
            if ticker:
                traded_today_codes.add(ticker.split(".")[0])
            if tx["type"] == "buy":
                buy_count += 1
                prior_buy = tx
            elif tx["type"] == "sell" and prior_buy:
                try:
                    ret = (tx["price"] / prior_buy["price"] - 1) * 100
                    cycle_results.append(ret)
                    last_sell_dt = datetime.fromisoformat(
                        (tx.get("executed_at") or "").split(".")[0].replace("Z", "+00:00")
                    ).replace(tzinfo=None) + timedelta(hours=9)  # KST 보정
                except Exception:
                    pass
                prior_buy = None
        if traded_today_codes:
            logger.info(
                f"당일 거래 종목 {len(traded_today_codes)}개 로드 "
                f"(buy_count={buy_count}, 사이클 {len(cycle_results)}건): {sorted(traded_today_codes)}"
            )
        # 재기동 시 직전 N사이클 손실이면 쿨다운 복원
        if (
            len(cycle_results) >= LOSS_STREAK_THRESHOLD
            and all(r < 0 for r in cycle_results[-LOSS_STREAK_THRESHOLD:])
            and last_sell_dt
        ):
            cooldown_until = last_sell_dt + timedelta(minutes=COOLDOWN_MINUTES)
            logger.info(f"  연패 쿨다운 복원: {cooldown_until.strftime('%H:%M')}까지 진입 차단")
    except Exception as e:
        logger.warning(f"당일 거래 종목 로드 실패: {e}")

    # 시작 시 portfolio에 holdings가 남아있으면 HOLDING 상태로 인계 (이전 프로세스 비정상 종료 대비)
    portfolio = load_portfolio(INVESTOR_ID)
    if portfolio.get("holdings"):
        ticker, h = next(iter(portfolio["holdings"].items()))
        holding = {
            "ticker": ticker,
            "name": h["name"],
            "code": ticker.split(".")[0],
            "avg_price": h["avg_price"],
            "buy_dt": datetime.now(),  # 인수 시각을 buy_dt로 — 즉시 가격 체크 후 청산 판단
            "hold_close_dt": datetime.now() + timedelta(minutes=HOLD_DURATION_MIN),
            "peak_pct": 0.0,
            "trailing_active": False,
        }
        state = "HOLDING"
        logger.info(f"기존 보유 인계: {h['name']}({ticker}) avg={h['avg_price']:,}원")

    summary = []            # 종료 요약용 매매 결과
    prev_ranking = {}       # v4 점프 감지용 — 직전 분 등락률 순위 캐시

    while datetime.now() < scan_end or state == "HOLDING":
        if check_kill_switch():
            logger.warning("킬스위치 활성화 — 모니터링 중단")
            notify_monitor("🛑 *[정채원 Q]* 킬스위치 활성화로 중단")
            break

        now = datetime.now()

        if state == "HOLDING":
            # 매수 종목 가격 체크
            try:
                info = client.get_current_price(holding["code"])
                current_price = info["price"]
            except Exception as e:
                logger.warning(f"  [HOLD] 시세 조회 실패: {e}")
                current_price = 0

            elapsed_min = int((now - holding["buy_dt"]).total_seconds() // 60)
            exit_reason = None
            exit_pct = 0.0

            if current_price > 0:
                pct = (current_price / holding["avg_price"] - 1) * 100
                exit_pct = pct
                # 고점 갱신
                if pct > holding["peak_pct"]:
                    holding["peak_pct"] = pct
                # 트레일링 활성화
                if not holding["trailing_active"] and pct >= TRAILING_ACTIVATE_PCT:
                    holding["trailing_active"] = True
                    logger.info(f"  [HOLD +{elapsed_min}m] 트레일링 익절 활성화 ({pct:+.2f}%)")

                trail_tag = " 🎯" if holding["trailing_active"] else ""
                logger.info(
                    f"  [HOLD +{elapsed_min}m] {holding['name']} {current_price:,}원 "
                    f"({pct:+.2f}%, peak {holding['peak_pct']:+.2f}%){trail_tag}"
                )
                # 손절 — 즉시
                if pct <= STOP_LOSS_PCT:
                    exit_reason = f"손절 ({pct:+.2f}%)"
                # 트레일링 익절 — 활성화 후 고점 대비 -1%p 되돌림
                elif (
                    holding["trailing_active"]
                    and pct <= holding["peak_pct"] - TRAILING_PULLBACK_PCT
                ):
                    exit_reason = (
                        f"트레일링 익절 ({pct:+.2f}%, peak {holding['peak_pct']:+.2f}%)"
                    )

            if not exit_reason and now >= holding["hold_close_dt"]:
                exit_reason = f"강제 청산 ({exit_pct:+.2f}%)"

            if exit_reason:
                trades = execute_sell_all(client, today_str, exit_reason, dry_run=dry_run)
                if trades:
                    if "익절" in exit_reason:
                        emoji = "💰"
                    elif "손절" in exit_reason:
                        emoji = "🛑"
                    else:
                        emoji = "⏰"
                    notify_monitor(
                        f"{emoji} *[정채원 Q] {holding['name']} 청산* {exit_pct:+.2f}% — {exit_reason}"
                    )
                    summary.append(
                        f"{holding['buy_dt'].strftime('%H:%M')} {holding['name']} "
                        f"{exit_pct:+.2f}% ({exit_reason})"
                    )
                # 사이클 결과 기록 + 쿨다운 판단
                cycle_results.append(exit_pct)
                last_sell_dt = datetime.now()
                if (
                    len(cycle_results) >= LOSS_STREAK_THRESHOLD
                    and all(r < 0 for r in cycle_results[-LOSS_STREAK_THRESHOLD:])
                ):
                    cooldown_until = last_sell_dt + timedelta(minutes=COOLDOWN_MINUTES)
                    logger.info(
                        f"  ⚠️ 연패 {LOSS_STREAK_THRESHOLD}회 → 쿨다운 "
                        f"{cooldown_until.strftime('%H:%M')}까지 진입 차단"
                    )
                    notify_monitor(
                        f"⚠️ *[정채원 Q] 연패 쿨다운* — {LOSS_STREAK_THRESHOLD}회 연속 손실, "
                        f"~{cooldown_until.strftime('%H:%M')} 진입 중단"
                    )
                if not dry_run:
                    refresh_daily_report(today_str)
                state = "IDLE"
                holding = None

        else:  # IDLE
            # 스캔 윈도우 종료 시각이 지났으면 더 이상 매수 안 함
            if now >= scan_end:
                break

            # bear 레짐 진입 차단 (v3)
            if block_entry:
                logger.info(
                    f"  [스캔 {now.strftime('%H:%M')}] bear 레짐 — 신규 진입 차단, 종료"
                )
                break

            # 일일 매매 한도 체크
            if buy_count >= DAILY_TRADE_LIMIT:
                logger.info(
                    f"  [스캔 {now.strftime('%H:%M')}] 일일 매매 한도 도달 "
                    f"({buy_count}/{DAILY_TRADE_LIMIT}) — 추가 진입 차단"
                )
                # 한도 도달 시 더 이상 진입할 일 없으니 종료
                break

            # 연패 쿨다운 체크
            if cooldown_until and now < cooldown_until:
                logger.info(
                    f"  [스캔 {now.strftime('%H:%M')}] 쿨다운 중 "
                    f"(~{cooldown_until.strftime('%H:%M')}) — 진입 차단"
                )
            else:
                if cooldown_until and now >= cooldown_until:
                    logger.info(f"  쿨다운 해제 ({cooldown_until.strftime('%H:%M')})")
                    cooldown_until = None

                picked, prev_ranking = pick_short_term_signal(
                    client, now, today,
                    prev_ranking=prev_ranking,
                    exclude_codes=traded_today_codes,
                )
                if not picked:
                    pass  # pick_short_term_signal 내부에서 자체 로깅
                if picked:
                    bought = execute_buy(
                        client, picked["code"], picked.get("name", ""),
                        today_str, dry_run=dry_run,
                    )
                    if bought:
                        ticker, name, exec_price, shares = bought
                        buy_dt = datetime.now()
                        hold_close_dt = buy_dt + timedelta(minutes=HOLD_DURATION_MIN)
                        holding = {
                            "ticker": ticker,
                            "name": name,
                            "code": picked["code"],
                            "avg_price": exec_price,
                            "buy_dt": buy_dt,
                            "hold_close_dt": hold_close_dt,
                            "peak_pct": 0.0,
                            "trailing_active": False,
                        }
                        traded_today_codes.add(picked["code"])
                        buy_count += 1
                        state = "HOLDING"
                        notify_monitor(
                            f"⚡ *[정채원 Q] {buy_dt.strftime('%H:%M')} 매수* {name} "
                            f"({buy_count}/{DAILY_TRADE_LIMIT})\n"
                            f"{shares}주 × {exec_price:,}원 = {shares * exec_price:,}원 "
                            f"(코드 {picked['code']}, 청산 ~{hold_close_dt.strftime('%H:%M')})"
                        )
                        if not dry_run:
                            refresh_daily_report(today_str)

        # HOLDING은 HOLD_INTERVAL_SEC 단위, IDLE은 다음 분 단위로 대기
        # (HOLDING 중 hold_close가 다음 tick 이내면 그 시각까지만 대기)
        if state == "HOLDING":
            next_tick = datetime.now() + timedelta(seconds=HOLD_INTERVAL_SEC)
            if holding and holding["hold_close_dt"] < next_tick:
                target = holding["hold_close_dt"]
            else:
                target = next_tick
        else:
            target = (datetime.now() + timedelta(minutes=SCAN_INTERVAL_MIN)).replace(
                second=0, microsecond=0
            )
        if not wait_until(target, label="next tick"):
            break

    # 윈도우 종료 시 holding 잔여분 강제 청산
    if state == "HOLDING" and holding:
        try:
            info = client.get_current_price(holding["code"])
            final_price = info["price"]
            final_pct = (final_price / holding["avg_price"] - 1) * 100
        except Exception:
            final_pct = 0
        trades = execute_sell_all(client, today_str, f"종료 청산 ({final_pct:+.2f}%)", dry_run=dry_run)
        if trades:
            notify_monitor(f"⏰ *[정채원 Q] {holding['name']} 종료 청산* {final_pct:+.2f}%")
            summary.append(
                f"{holding['buy_dt'].strftime('%H:%M')} {holding['name']} "
                f"{final_pct:+.2f}% (종료 청산)"
            )
        cycle_results.append(final_pct)
        if not dry_run:
            refresh_daily_report(today_str)

    # 종료 요약
    portfolio = load_portfolio(INVESTOR_ID)
    cash = portfolio["cash"]
    wins = sum(1 for r in cycle_results if r > 0)
    losses = sum(1 for r in cycle_results if r <= 0)
    win_rate = (wins / len(cycle_results) * 100) if cycle_results else 0.0
    final = (
        f"⚡ *[정채원 Q] 모니터링 종료* ({today_str})\n"
        f"현금: {cash:,}원\n"
        f"매매 횟수: {len(summary)}회 (한도 {DAILY_TRADE_LIMIT}회)\n"
        f"승/패: {wins}/{losses} (승률 {win_rate:.1f}%)\n"
        + ("\n".join(f"• {s}" for s in summary) if summary else "• 매매 없음")
    )
    notify(final)
    logger.info(final)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Q 정채원 1분 상시 스캔 스캘핑 모니터링")
    parser.add_argument("--dry-run", action="store_true", help="매매 없이 로그만")
    args = parser.parse_args()
    run_monitor(dry_run=args.dry_run)
