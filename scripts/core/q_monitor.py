"""Q 정채원 v2.1 — 급락 반등 스캘핑

이슈 #60 — 2026-05-18 백지 재설계 + Out-of-sample 검증 통과.

룰 요약:
  풀:      KOSPI200 ∪ stock_universe (199종목)
  시그널:  직전 5분 ≤ -2.5% AND 현재 분봉 양봉 ≥ +0.3%
  진입:    다음 분 시가 (KIS 시장가)
  청산:    +2.5% 익절 / -1.5% 손절 / 30분 시간청산
  시간대:  09:30 ~ 14:00 (진입 종료 14:00, HOLDING 모니터링 14:30까지)
  동시:    1종목, 당일 재매수 금지

백테스트 (18영업일, 4/21~5/18):
  - 학습 12일 (4/21~5/8): 13건 / 승률 61.5% / +9.02%
  - 검증 6일  (5/11~5/18): 14건 / 승률 57.1% / +7.97%
  - 통합:    27건 / 승률 59.3% / 약 +17% / MDD -4.67%
  - 학습·검증 비슷 → 과최적화 가능성 낮음 (단, 표본 27건은 작음)

안전장치 (유지):
  - 일일 매매 한도 8회
  - 연패 쿨다운: 직전 3사이클 모두 손실이면 60분 진입 차단
  - bear 레짐 → 신규 진입 차단
  - 매매당 1,000만원 캡

폐기된 v5 요소:
  - vol/5MA 3배 시그널        (EDA에서 무알파 확인)
  - KOSPI200 정적 풀          (KOSPI200 ∪ stock_universe로 확장)
  - 진입 윈도우 10:00~10:30   (09:30~14:00로 확장)
  - 트레일링 익절             (단순 +2.5/-1.5)
  - post5_vol 동적 보유       (30분 고정)

Usage:
    python3 scripts/core/q_monitor.py              # 실행
    python3 scripts/core/q_monitor.py --dry-run    # 매매 없이 로그만
"""
from __future__ import annotations

import sys
import time
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, date, timedelta, timezone
from pathlib import Path

import holidays

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "notifications"))

from supabase_client import supabase
from portfolio import load_portfolio, load_profile, save_portfolio, evaluate, calc_fees
from broker_client import KISClient
from daily_pipeline import notify_monitor
from logger import get_logger
from kospi200 import KOSPI200_CODES

logger = get_logger("q_monitor")

INVESTOR_ID = "Q"

# === v2.1 시그널 / 청산 파라미터 ===
ENTRY_PREV_5M_PCT = -2.5        # 직전 5분 변화율 ≤ -2.5%
ENTRY_MIN_CANDLE_PCT = 0.3      # 현재 분봉 양봉 강도 ≥ +0.3%
# float precision 보정 — 표시상 임계 정확히 일치(+0.30%, -2.50%)하지만 부동소수점에서
# 0.2998 / -2.4998로 계산되어 미달 분류되는 경계를 살림. 2026-06-05 454910 케이스에서
# candle +0.30% 표시값이 실제 0.2998xx로 미달 처리된 사례 확인.
ENTRY_THRESHOLD_EPSILON = 1e-3
TAKE_PROFIT_PCT = 2.5           # 익절 +2.5%
STOP_LOSS_PCT = 1.5             # 손절 -1.5%
HOLD_MIN = 30                   # 시간청산 30분
MAX_CAPITAL_PER_TRADE = 10_000_000

# near-miss 로깅 임계 (시그널 미달이지만 분포 진단용)
NEAR_MISS_PREV_5M_PCT = -2.0    # 시그널 -2.5에서 0.5%p 이내
NEAR_MISS_CANDLE_PCT = 0.1      # 시그널 +0.3에서 0.2%p 이내
NEAR_MISS_LOG_TOP_N = 5         # 매스캔당 상위 N개만 INFO 출력

# 시간 윈도우 (KST)
SCAN_START_HH, SCAN_START_MM = 9, 30
ENTRY_END_HH, ENTRY_END_MM = 14, 0
HOLD_MAX_END_HH, HOLD_MAX_END_MM = 14, 30   # 14:00 마지막 진입 + 30분 보유

# 스캔 주기 (IDLE: 매 분 :20 정렬 / HOLDING: 30초 현재가 체크)
# 분 경계 :20 정렬 — KIS 분봉 latency(분 마감 후 입수까지 ~수십초) 회피
SCAN_MINUTE_OFFSET_SEC = 20
HOLD_INTERVAL_SEC = 30

# === 안전장치 ===
DAILY_TRADE_LIMIT = 8
LOSS_STREAK_THRESHOLD = 3
COOLDOWN_MINUTES = 60
BEAR_BLOCK_ENTRY = True

# 시그널 평가 시 풀 1분봉 호출 동시성 (KIS 500 에러 감소 위해 보수적 worker 수)
# 5/18 14:00 종료 시점 분석: worker 6에서도 매분 ~20건 500 에러 → worker 4 + jitter로 추가 완화
SIGNAL_SCAN_WORKERS = 4
SIGNAL_SCAN_JITTER_SEC = 0.05   # _evaluate_one 시작 시 0~50ms 분산 sleep (KIS 동시 호출 spike 완화)

KR_HOLIDAYS = holidays.KR()


# ========== 시간 유틸 ==========

def prev_business_day(today):
    d = today - timedelta(days=1)
    while d.weekday() >= 5 or d in KR_HOLIDAYS:
        d -= timedelta(days=1)
    return d


def is_business_day(d):
    return d.weekday() < 5 and d not in KR_HOLIDAYS


def wait_until(target_dt, label=""):
    """목표 시각까지 sleep"""
    if target_dt <= datetime.now():
        return True
    while datetime.now() < target_dt:
        remaining = (target_dt - datetime.now()).total_seconds()
        time.sleep(min(60, max(1, remaining)))
    return True


def wait_to_next_scan_slot(entry_end, hold_max_end):
    """다음 분의 :SCAN_MINUTE_OFFSET_SEC 시각까지 대기.

    분봉 latency 회피용 — 현재 분이 마감된 후 ~수십 초 뒤에야 KIS에 직전 분봉이 입수.
    스캔 시점을 분 경계 :20으로 고정해 직전 분봉 결손 가능성 최소화.

    early-exit: entry_end / hold_max_end 통과 시 즉시 반환 (메인 루프 종료 조건 빠른 평가).
    """
    now = datetime.now()
    next_slot = (now + timedelta(minutes=1)).replace(
        second=SCAN_MINUTE_OFFSET_SEC, microsecond=0
    )
    # 분이 바뀌었지만 아직 :SCAN_MINUTE_OFFSET_SEC 전이면 같은 분의 슬롯으로
    same_min_slot = now.replace(second=SCAN_MINUTE_OFFSET_SEC, microsecond=0)
    if same_min_slot > now:
        next_slot = same_min_slot
    cap = min(hold_max_end, entry_end + timedelta(minutes=30))  # 보유 모니터링 한계
    target = min(next_slot, cap)
    if target <= now:
        return
    while datetime.now() < target:
        remaining = (target - datetime.now()).total_seconds()
        time.sleep(min(10, max(0.5, remaining)))


# ========== 티커 변환 ==========

def kis_to_yf_ticker(code, market_name=""):
    if not market_name:
        return f"{code}.KS"
    upper = market_name.upper()
    if "KSQ" in upper or "KOSDAQ" in upper:
        return f"{code}.KQ"
    return f"{code}.KS"


def _pykrx_name(code):
    try:
        from pykrx import stock as pykrx_stock
        name = pykrx_stock.get_market_ticker_name(code)
        return name if name else ""
    except Exception:
        return ""


def fetch_market_name(client, code):
    """KIS 현재가 응답에서 시장명·종목명·현재가 동시 조회."""
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
        kis_name = _pykrx_name(code)
    return market_name, kis_name, price


# ========== 레짐 게이트 ==========

def get_regime_block(today):
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
            return f"{regime} (bull_score={score}) → 진입 차단", True
        return f"{regime} (bull_score={score})", False
    except Exception as e:
        logger.warning(f"레짐 조회 실패 — 차단 없음: {e}")
        return "error", False


# ========== 풀 구성 ==========

def build_pool() -> list[tuple[str, str]]:
    """v2.1 풀: 백테스트와 동일한 199종목.

    우선순위:
      1) scripts/q_v2/cache/universe.csv (유동성 통과) ∩ (KOSPI200 ∪ stock_universe)
         → 백테스트 진단(3-a)에서 흑자가 확인된 정확한 풀
      2) universe.csv 없으면 KOSPI200 ∪ stock_universe (유동성 검증 없음, fallback)

    Returns: [(code, market_name_hint)] — market_name_hint는 "KOSPI"/"KOSDAQ"
    """
    # stock_universe 로드
    cfg = supabase.table("config").select("stock_universe").eq("id", 1).execute().data[0]
    su_tickers = {item["ticker"] for item in cfg["stock_universe"]}
    kp200_tickers = {f"{c}.KS" for c in KOSPI200_CODES}
    base_tickers = su_tickers | kp200_tickers   # 299종목

    # universe.csv 교집합 (유동성 통과)
    # KIS는 6자리 종목코드 요구 — universe.csv가 leading zero 손실 상태로 저장된 케이스 다수
    # (예: 011170 → 11170, 000240 → 240). zfill(6)로 정규화하여 KIS 500 에러 방지.
    universe_csv = Path(__file__).resolve().parents[1] / "q_v2" / "cache" / "universe.csv"
    if universe_csv.exists():
        import csv
        pool: dict[str, str] = {}
        with open(universe_csv) as f:
            for row in csv.DictReader(f):
                ticker = row["ticker"]
                if ticker in base_tickers:
                    code = (row["code"] or "").zfill(6)
                    if len(code) == 6:
                        pool[code] = row["market"]
        if len(pool) >= 100:   # 정상 로드 (백테스트는 199)
            logger.info(f"build_pool: universe.csv에서 {len(pool)}종목 로드 (유동성 통과 ∩ 베이스)")
            return list(pool.items())
        logger.warning(f"build_pool: universe.csv 결과가 적음({len(pool)}) — fallback")

    # fallback (KOSPI200_CODES는 이미 6자리)
    pool = {}
    for code in KOSPI200_CODES:
        pool[code.zfill(6)] = "KOSPI"
    for ticker in su_tickers:
        code = ticker.split(".")[0].zfill(6)
        if code not in pool:
            pool[code] = "KOSPI" if ticker.endswith(".KS") else "KOSDAQ"
    logger.warning(f"build_pool: universe.csv 없음 — fallback {len(pool)}종목 (유동성 미검증)")
    return list(pool.items())


# ========== 시그널 스캔 ==========

def _evaluate_one(client, code, today_str):
    """단일 종목 1분봉 6개 호출 → prev_5m, candle 평가.

    Returns:
        dict {code, prev_5m, candle, close, status} —
            status: "match"     : 시그널 충족
                    "near_miss" : prev_5m ≤ -2.0% OR candle ≥ +0.1% (분포 진단)
                    "miss"      : 둘 다 거리 큼
        None — 데이터 호출 실패 (다음 스캔에서 우선 재시도 대상)
    """
    # worker 동시 시작 시 KIS spike 회피 — 0~50ms jitter
    import random
    if SIGNAL_SCAN_JITTER_SEC > 0:
        time.sleep(random.uniform(0, SIGNAL_SCAN_JITTER_SEC))
    try:
        now_hhmm = datetime.now().strftime("%H%M00")
        bars = client.get_minute_chart(
            code, today_str.replace("-", ""),
            hour_str=now_hhmm, include_past="Y"
        )
    except Exception:
        return None
    if not bars or len(bars) < 6:
        return None
    bars.sort(key=lambda b: b.get("time", ""))
    recent6 = bars[-6:]
    c0 = float(recent6[0].get("close", 0))    # 5분 전 종가
    c5 = float(recent6[-1].get("close", 0))   # 직전 1분 종가
    o5 = float(recent6[-1].get("open", 0))    # 직전 1분 시가
    if c0 <= 0 or o5 <= 0:
        return None
    prev_5m = (c5 / c0 - 1) * 100
    candle = (c5 - o5) / o5 * 100
    # float precision 보정: 표시상 임계 일치하는 경계를 ε(=1e-3) 마진으로 살림
    entry_prev_pass = prev_5m <= ENTRY_PREV_5M_PCT + ENTRY_THRESHOLD_EPSILON
    entry_candle_pass = candle >= ENTRY_MIN_CANDLE_PCT - ENTRY_THRESHOLD_EPSILON
    if entry_prev_pass and entry_candle_pass:
        status = "match"
    elif prev_5m <= NEAR_MISS_PREV_5M_PCT or candle >= NEAR_MISS_CANDLE_PCT:
        status = "near_miss"
    else:
        status = "miss"
    return {"code": code, "prev_5m": prev_5m, "candle": candle, "close": c5, "status": status}


def scan_signal(
    client,
    pool_codes: list[str],
    today_str: str,
    exclude: set[str],
    retry_first: set[str] | None = None,
) -> dict:
    """풀 1분봉 평가.

    Args:
        retry_first: 직전 스캔에서 호출 실패한 종목 — 별도 worker로 먼저 시도(공정성 확보).

    Returns:
        {
            "matches": [...],         # status=="match", prev_5m 작은 순
            "near_misses": [...],     # status=="near_miss", prev_5m 작은 순
            "failed_codes": set,      # 데이터 호출 최종 실패 (다음 스캔 우선 재시도)
            "eval_count": int,        # 평가 성공 (match+near_miss+miss)
            "fail_count": int,        # = len(failed_codes)
        }
    """
    matches = []
    near_misses = []
    failed_codes: set[str] = set()
    eval_count = 0
    targets = [c for c in pool_codes if c not in exclude]

    def _consume(fut, code):
        nonlocal eval_count
        r = fut.result()
        if r is None:
            failed_codes.add(code)
            return
        eval_count += 1
        if r["status"] == "match":
            matches.append(r)
        elif r["status"] == "near_miss":
            near_misses.append(r)

    # 1) 직전 실패 종목 우선 재시도 (낮은 동시성 — KIS 부담 최소화)
    if retry_first:
        target_set = set(targets)
        retry_targets = [c for c in retry_first if c in target_set]
        if retry_targets:
            with ThreadPoolExecutor(max_workers=2) as ex:
                futs = {ex.submit(_evaluate_one, client, c, today_str): c for c in retry_targets}
                for fut in as_completed(futs):
                    _consume(fut, futs[fut])
            retry_set = set(retry_targets)
            targets = [c for c in targets if c not in retry_set]

    # 2) 일반 스캔
    with ThreadPoolExecutor(max_workers=SIGNAL_SCAN_WORKERS) as ex:
        futs = {ex.submit(_evaluate_one, client, c, today_str): c for c in targets}
        for fut in as_completed(futs):
            _consume(fut, futs[fut])

    matches.sort(key=lambda x: x["prev_5m"])
    near_misses.sort(key=lambda x: x["prev_5m"])
    return {
        "matches": matches,
        "near_misses": near_misses,
        "failed_codes": failed_codes,
        "eval_count": eval_count,
        "fail_count": len(failed_codes),
    }


# ========== 매매 ==========

def execute_buy(client, code, name_hint, today_str, dry_run=False):
    """시장가 매수 — capital = min(cash, 1,000만원)."""
    portfolio = load_portfolio(INVESTOR_ID)
    cash = portfolio["cash"]
    capital = min(cash, MAX_CAPITAL_PER_TRADE)

    try:
        market_name, kis_name, current_price = fetch_market_name(client, code)
    except Exception as e:
        logger.warning(f"  현재가 조회 실패 ({code}): {e}")
        return None
    if current_price <= 0:
        logger.warning(f"  현재가 0 — 매수 스킵 ({code})")
        return None

    name = kis_name or name_hint or _pykrx_name(code) or code
    ticker = kis_to_yf_ticker(code, market_name)

    exec_price_est, _ = calc_fees(ticker, current_price, 1, "buy")
    shares = capital // exec_price_est
    if shares <= 0:
        logger.warning(f"  매수 수량 0 — 자본 부족 ({capital:,}원)")
        return None
    exec_price, fee = calc_fees(ticker, current_price, shares, "buy")
    cost = shares * exec_price
    total_cost = cost + fee
    while total_cost > cash and shares > 0:
        shares -= 1
        exec_price, fee = calc_fees(ticker, current_price, shares, "buy")
        cost = shares * exec_price
        total_cost = cost + fee
    if shares <= 0:
        logger.warning(f"  매수 불가 — 현금 부족")
        return None

    if dry_run:
        logger.info(f"  [dry-run] BUY {name}({code}) {shares}주 × {exec_price:,}원 = {cost:,}원")
        return ticker, name, exec_price, shares

    portfolio["cash"] = cash - total_cost
    portfolio["holdings"][ticker] = {
        "name": name,
        "shares": shares,
        "avg_price": exec_price,
        "buy_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table("transactions").insert({
        "investor_id": INVESTOR_ID, "date": today_str, "type": "buy",
        "ticker": ticker, "name": name, "shares": shares,
        "price": exec_price, "amount": cost, "fee": fee,
        "executed_at": datetime.now(timezone.utc).isoformat(),
        "season_id": 1,  # Q 정채원은 시즌 무관, 시즌1 누적 유지
    }).execute()
    market = "KOSPI" if ticker.endswith(".KS") else "KOSDAQ"
    supabase.table("stock_names").upsert(
        {"ticker": ticker, "name": name, "market": market, "updated_at": "now()"},
        on_conflict="ticker",
    ).execute()
    save_portfolio(INVESTOR_ID, portfolio)
    logger.info(f"  ✅ BUY {name}({ticker}) {shares}주 × {exec_price:,}원 = {cost:,}원")
    return ticker, name, exec_price, shares


def execute_sell_all(client, today_str, reason, dry_run=False):
    """현재 보유 종목 전량 매도."""
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
            "season_id": 1,  # Q 정채원은 시즌 무관, 시즌1 누적 유지
        })
        pct = (exec_price / h["avg_price"] - 1) * 100
        trades.append({"ticker": ticker, "name": name, "shares": sell_shares,
                       "price": exec_price, "profit": profit, "pct": pct, "reason": reason})
        logger.info(f"  ✅ SELL {name}({ticker}) {sell_shares}주 × {exec_price:,}원 ({pct:+.2f}%, {reason})")

    if pending and not dry_run:
        supabase.table("transactions").insert(pending).execute()
        save_portfolio(INVESTOR_ID, portfolio)
    return trades


# ========== 청산 평가 ==========

def check_exit(holding: dict, current_price: int, now_dt: datetime):
    """청산 조건 평가.

    Returns: (should_exit: bool, reason: str)
    """
    avg = holding["avg_price"]
    pct = (current_price / avg - 1) * 100
    if pct >= TAKE_PROFIT_PCT:
        return True, f"익절 +{pct:.2f}%"
    if pct <= -STOP_LOSS_PCT:
        return True, f"손절 {pct:.2f}%"
    elapsed_min = (now_dt - holding["buy_dt"]).total_seconds() / 60
    if elapsed_min >= HOLD_MIN:
        return True, f"시간청산 {elapsed_min:.0f}분 ({pct:+.2f}%)"
    return False, ""


# ========== 리포트 갱신 ==========

def refresh_daily_report(date_str):
    """Q 매매 후 daily_reports & portfolio_snapshots 갱신."""
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

        # daily_reports는 (date) PK라 시뮬 11명과 공유 → 그날의 메인 시즌으로 유지
        from supabase_client import get_current_season_id
        supabase.table("daily_reports").upsert({
            "date": date_str,
            "generated_at": report["generated_at"],
            "market_prices": report["market_prices"],
            "rankings": rankings,
            "investor_details": report["investor_details"],
            "season_id": get_current_season_id(),
        }).execute()

        # Q의 portfolio_snapshots는 Q 자기 데이터 → 시즌 무관, 시즌1 유지
        supabase.table("portfolio_snapshots").upsert({
            "investor_id": INVESTOR_ID,
            "date": date_str,
            "holdings": result["holdings"],
            "cash": portfolio["cash"],
            "total_asset": result["total_asset"],
            "snapshot_at": datetime.now(timezone.utc).isoformat(),
            "season_id": 1,
        }).execute()
        logger.info(f"  📊 daily_reports 갱신 (자산 {result['total_asset']:,}원)")
    except Exception as e:
        logger.error(f"  daily_reports 갱신 실패: {e}")


# ========== 상태 복원 (재기동 시) ==========

def restore_today_state(today_str):
    """오늘자 transactions 로드 → 거래 종목 set, buy_count, 사이클 손익, 쿨다운."""
    traded_codes = set()
    buy_count = 0
    cycle_results = []
    last_sell_dt = None
    cooldown_until = None

    try:
        txs = supabase.table("transactions").select(
            "ticker,type,price,executed_at"
        ).eq("investor_id", INVESTOR_ID).eq("date", today_str).execute().data or []
        txs.sort(key=lambda x: x.get("executed_at") or "")
        prior_buy = None
        for tx in txs:
            ticker = tx.get("ticker", "")
            if ticker:
                traded_codes.add(ticker.split(".")[0])
            if tx["type"] == "buy":
                buy_count += 1
                prior_buy = tx
            elif tx["type"] == "sell" and prior_buy:
                try:
                    ret = (tx["price"] / prior_buy["price"] - 1) * 100
                    cycle_results.append(ret)
                    last_sell_dt = datetime.fromisoformat(
                        (tx.get("executed_at") or "").split(".")[0].replace("Z", "+00:00")
                    ).replace(tzinfo=None) + timedelta(hours=9)
                except Exception:
                    pass
                prior_buy = None
        if (
            len(cycle_results) >= LOSS_STREAK_THRESHOLD
            and all(r < 0 for r in cycle_results[-LOSS_STREAK_THRESHOLD:])
            and last_sell_dt
        ):
            cooldown_until = last_sell_dt + timedelta(minutes=COOLDOWN_MINUTES)
            logger.info(f"  연패 쿨다운 복원: {cooldown_until.strftime('%H:%M')}까지")
    except Exception as e:
        logger.warning(f"transactions 복원 실패: {e}")

    return traded_codes, buy_count, cycle_results, cooldown_until


# ========== 메인 모니터링 루프 ==========

def run_monitor(dry_run=False):
    today = date.today()
    today_str = today.isoformat()
    if not is_business_day(today):
        logger.info(f"휴장일 ({today_str}) — Q 모니터링 스킵")
        return

    client = KISClient()
    # ThreadPool 워커들이 동시에 _ensure_token 진입하여 중복 발급하는 race 방지 (08:45 prewarm)
    client._ensure_token()
    regime_label, block_entry = get_regime_block(today)
    logger.info(f"레짐: {regime_label}")

    pool_codes = [c for c, _ in build_pool()]

    if block_entry:
        notify_monitor(
            f"⚡ *[정채원 Q v2.1] 모니터링 시작* ({today_str})\n"
            f"레짐: {regime_label}\n"
            f"🛑 신규 진입 차단 — bear 휩쏘 회피\n"
            f"(dry_run={dry_run})"
        )
    else:
        notify_monitor(
            f"⚡ *[정채원 Q v2.1] 모니터링 시작* ({today_str})\n"
            f"레짐: {regime_label}\n"
            f"풀: {len(pool_codes)}종목 (KOSPI200 ∪ stock_universe)\n"
            f"시그널: 직전 5분 ≤ {ENTRY_PREV_5M_PCT}% AND 양봉 ≥ +{ENTRY_MIN_CANDLE_PCT}%\n"
            f"청산: +{TAKE_PROFIT_PCT}% / -{STOP_LOSS_PCT}% / {HOLD_MIN}분\n"
            f"시간대: {SCAN_START_HH:02d}:{SCAN_START_MM:02d}~"
            f"{ENTRY_END_HH:02d}:{ENTRY_END_MM:02d}\n"
            f"한도: 일일 {DAILY_TRADE_LIMIT}회, 연패 {LOSS_STREAK_THRESHOLD}회 → {COOLDOWN_MINUTES}분\n"
            f"(dry_run={dry_run})"
        )

    base_dt = datetime.combine(today, datetime.min.time())
    # 분봉 latency 회피: 09:30:00 정각이 아니라 09:30:SCAN_MINUTE_OFFSET_SEC부터 첫 스캔
    scan_start = base_dt.replace(
        hour=SCAN_START_HH, minute=SCAN_START_MM, second=SCAN_MINUTE_OFFSET_SEC
    )
    entry_end = base_dt.replace(hour=ENTRY_END_HH, minute=ENTRY_END_MM)
    hold_max_end = base_dt.replace(hour=HOLD_MAX_END_HH, minute=HOLD_MAX_END_MM)

    if datetime.now() < scan_start:
        logger.info(f"스캔 시작 {scan_start.strftime('%H:%M:%S')}까지 대기")
        if not wait_until(scan_start, label="scan start"):
            return

    # 재기동 상태 복원
    traded_codes, buy_count, cycle_results, cooldown_until = restore_today_state(today_str)
    if traded_codes:
        logger.info(
            f"당일 거래 종목 {len(traded_codes)}개 로드 "
            f"(buy_count={buy_count}, 사이클 {len(cycle_results)}건)"
        )

    state = "IDLE"
    holding = None

    # 기존 보유 인계 (재기동) — buy_at 우선, 없으면 transactions에서 같은 ticker 마지막 buy 시각
    portfolio = load_portfolio(INVESTOR_ID)
    if portfolio.get("holdings"):
        ticker, h = next(iter(portfolio["holdings"].items()))
        buy_at_iso = h.get("buy_at")
        if not buy_at_iso:
            try:
                tx_rows = supabase.table("transactions").select("executed_at").eq(
                    "investor_id", INVESTOR_ID
                ).eq("date", today_str).eq("type", "buy").eq("ticker", ticker).order(
                    "id", desc=True
                ).limit(1).execute().data
                if tx_rows and tx_rows[0].get("executed_at"):
                    buy_at_iso = tx_rows[0]["executed_at"]
            except Exception as e:
                logger.warning(f"transactions에서 buy 시각 조회 실패: {e}")
        if buy_at_iso:
            try:
                buy_dt = datetime.fromisoformat(buy_at_iso.replace("Z", "+00:00")).astimezone().replace(tzinfo=None)
            except Exception:
                buy_dt = datetime.now()
        else:
            buy_dt = datetime.now()
        holding = {
            "ticker": ticker, "name": h["name"], "code": ticker.split(".")[0],
            "avg_price": h["avg_price"], "buy_dt": buy_dt,
        }
        state = "HOLDING"
        elapsed_min = (datetime.now() - buy_dt).total_seconds() / 60
        logger.info(
            f"기존 보유 인계: {h['name']}({ticker}) avg={h['avg_price']:,}원 "
            f"buy_dt={buy_dt.strftime('%H:%M:%S')} ({elapsed_min:.1f}분 경과)"
        )

    summary = []   # 종료 요약용 매매 결과
    pending_retry: set[str] = set()  # 직전 스캔 호출 실패 종목 — 다음 스캔 우선 재시도

    # ========== 메인 루프 ==========
    while datetime.now() < hold_max_end:
        now_dt = datetime.now()

        # ---------- HOLDING ----------
        if state == "HOLDING" and holding:
            code = holding["code"]
            try:
                info = client.get_current_price(code)
                current_price = int(info["price"])
            except Exception as e:
                logger.warning(f"  [HOLD] 현재가 실패: {e}")
                time.sleep(HOLD_INTERVAL_SEC)
                continue
            should_exit, reason = check_exit(holding, current_price, now_dt)
            pct = (current_price / holding["avg_price"] - 1) * 100
            logger.info(
                f"  [HOLD {(now_dt - holding['buy_dt']).total_seconds()/60:.1f}m] "
                f"{holding['name']} {current_price:,}원 ({pct:+.2f}%)"
            )
            if should_exit:
                trades = execute_sell_all(client, today_str, reason, dry_run=dry_run)
                if trades:
                    t = trades[0]
                    cycle_results.append((t["price"] / holding["avg_price"] - 1) * 100)
                    summary.append({
                        "ticker": t["ticker"], "name": t["name"],
                        "buy_price": holding["avg_price"], "sell_price": t["price"],
                        "profit": t["profit"], "pct": t.get("pct", 0), "reason": reason,
                    })
                state = "IDLE"
                holding = None
                refresh_daily_report(today_str)
                # 연패 쿨다운 평가
                if (len(cycle_results) >= LOSS_STREAK_THRESHOLD and
                        all(r < 0 for r in cycle_results[-LOSS_STREAK_THRESHOLD:])):
                    cooldown_until = datetime.now() + timedelta(minutes=COOLDOWN_MINUTES)
                    logger.warning(f"  3연패 — {cooldown_until.strftime('%H:%M')}까지 쿨다운")
                    notify_monitor(
                        f"🧊 *[Q v2.1] 3연패 쿨다운*\n"
                        f"{cooldown_until.strftime('%H:%M')}까지 진입 차단"
                    )
                continue
            time.sleep(HOLD_INTERVAL_SEC)
            continue

        # ---------- IDLE ----------
        # bear 차단
        if block_entry:
            logger.info("bear — 신규 진입 차단 / HOLDING 없음 → 종료")
            break

        # 진입 윈도우 마감
        if now_dt >= entry_end:
            logger.info(f"진입 윈도우 {entry_end.strftime('%H:%M')} 마감 — 종료")
            break

        # 일일 매매 한도
        if buy_count >= DAILY_TRADE_LIMIT:
            logger.info(f"일일 매매 한도 {DAILY_TRADE_LIMIT}회 도달 — 종료")
            break

        # 쿨다운
        if cooldown_until and now_dt < cooldown_until:
            wait_to_next_scan_slot(entry_end, hold_max_end)
            continue

        # 시그널 스캔 (풀 전 종목 1분봉)
        t0 = time.time()
        result = scan_signal(
            client, pool_codes, today_str,
            exclude=traded_codes,
            retry_first=pending_retry,
        )
        matches = result["matches"]
        near_misses = result["near_misses"]
        elapsed = time.time() - t0
        targets_n = len(pool_codes) - len(traded_codes)
        logger.info(
            f"  [스캔 {now_dt.strftime('%H:%M:%S')}] "
            f"풀 {targets_n}개 → 평가 {result['eval_count']} / 실패 {result['fail_count']} "
            f"/ 매치 {len(matches)} / near-miss {len(near_misses)} ({elapsed:.1f}s)"
        )

        # near-miss 분포 — 상위 N개 prev_5m / candle 노출 (튜닝 근거)
        for nm in near_misses[:NEAR_MISS_LOG_TOP_N]:
            logger.info(
                f"    near-miss: {nm['code']} prev_5m={nm['prev_5m']:+.2f}% "
                f"candle={nm['candle']:+.2f}%"
            )

        # 실패 종목 보관 → 다음 스캔 우선 재시도
        pending_retry = result["failed_codes"]

        if matches:
            best = matches[0]
            logger.info(
                f"  → BEST: {best['code']} prev_5m={best['prev_5m']:+.2f}% "
                f"candle={best['candle']:+.2f}% close={best['close']:,}원"
            )
            buy_result = execute_buy(client, best["code"], "", today_str, dry_run=dry_run)
            if buy_result:
                ticker, name, exec_price, shares = buy_result
                holding = {
                    "ticker": ticker, "name": name, "code": best["code"],
                    "avg_price": exec_price, "buy_dt": datetime.now(),
                }
                state = "HOLDING"
                buy_count += 1
                traded_codes.add(best["code"])
                summary.append({
                    "ticker": ticker, "name": name, "buy_price": exec_price,
                    "sell_price": None, "profit": None, "pct": None,
                    "reason": f"BUY (prev_5m={best['prev_5m']:+.2f}% candle={best['candle']:+.2f}%)",
                })
                refresh_daily_report(today_str)
                notify_monitor(
                    f"🟢 *[Q v2.1 매수]* {name} ({ticker})\n"
                    f"체결가 {exec_price:,}원 × {shares}주\n"
                    f"시그널: 직전 5분 {best['prev_5m']:+.2f}%, 양봉 {best['candle']:+.2f}%"
                )
                continue
        wait_to_next_scan_slot(entry_end, hold_max_end)

    # ========== 종료 처리 ==========
    if holding:
        logger.info(f"종료 시점 HOLDING — 강제 청산 ({holding['name']})")
        trades = execute_sell_all(client, today_str, "장마감 강제청산", dry_run=dry_run)
        if trades:
            t = trades[0]
            summary.append({
                "ticker": t["ticker"], "name": t["name"],
                "buy_price": holding["avg_price"], "sell_price": t["price"],
                "profit": t["profit"], "pct": t.get("pct", 0), "reason": "장마감 강제청산",
            })
            refresh_daily_report(today_str)

    # 종료 요약 텔레그램
    if summary:
        lines = []
        for s in summary:
            if s["sell_price"] is None:
                lines.append(f"  • BUY {s['name']} @ {s['buy_price']:,}")
            else:
                lines.append(
                    f"  • {s['name']} {s['buy_price']:,} → {s['sell_price']:,} "
                    f"({s['pct']:+.2f}%) [{s['reason']}]"
                )
        total_profit = sum(s["profit"] or 0 for s in summary)
        notify_monitor(
            f"⚡ *[Q v2.1] 모니터링 종료* ({today_str})\n"
            f"매매: {len(summary)}건\n"
            + "\n".join(lines) +
            f"\n총 손익: {total_profit:+,}원"
        )
    else:
        notify_monitor(f"⚡ *[Q v2.1] 모니터링 종료* ({today_str})\n매매: 0건 (시그널 없음)")

    logger.info(f"Q v2.1 모니터링 종료 (매매 {len(summary)}건)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="매매 없이 로그만")
    args = parser.parse_args()
    run_monitor(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
