"""C 옵션 한국 매크로 추종 — 매일 회사 비중 변경 감지 + KIS 자동 매매

- launchd 09:10 매일 실행 (스토리텔링 충돌 회피)
- BetterWealth FA 18판(KR2KRFACTR99NKI1) + 25판(KR2KRMCROR99NFN0) 비중 조회
- 합집합 평균 → affordable 필터(1주<자산5%) → 재정규화 → 1주 정수화
- portfolio/last_target.json과 diff → 변경 시 KIS 시장가 매도/매수
- 매매 후 DB(portfolios.UF + transactions + rebalance_history + portfolio_snapshots) 갱신
- 텔레그램 알림

가드:
- 한국 휴장일 스킵 (holidays.KR)
- 장 운영시간 09:10~14:30 외 스킵
- 킬스위치 활성화 시 매매 스킵 (Meta Manager 자동매매와 동일 가드)
"""
import sys
import json
import time
import argparse
import requests
from pathlib import Path
from datetime import datetime, date, timezone, timedelta

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "notifications"))

import holidays

from supabase_client import supabase, get_current_season_id
from broker_client import KISClient
from safety import check_kill_switch
from logger import get_logger
from send_telegram import send_telegram

logger = get_logger(__name__)

KST = timezone(timedelta(hours=9))
INVESTOR_ID = "UF"
INVESTOR_NAME = "이상운"
STRATEGY = "한국 매크로 로테이션 추종"
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
TARGET_CACHE = PROJECT_ROOT / "portfolio" / "last_target.json"
FA_TOKEN_FILE = PROJECT_ROOT / "portfolio" / ".fa_token.json"
FA_BASE_URL = "https://fa.betterwealth.co.kr"
FA_USERNAME = "qb.test@qbgroup.co.kr"
FA_PASSWORD = "qbgroup@01"
PRODUCT_18 = "KR2KRFACTR99NKI1"
PRODUCT_25 = "KR2KRMCROR99NFN0"
AFFORDABLE_THRESHOLD_PCT = 0.05  # 1주 가격 < 자산의 5%
BUY_FEE_RATE = 0.00015
SELL_FEE_RATE = 0.00015
SELL_TAX_RATE = 0.0018
TRADE_WINDOW_START = (9, 10)
TRADE_WINDOW_END = (14, 30)


# ========== 가드 ==========

def is_market_day(d):
    if d.weekday() >= 5:
        return False
    return d not in holidays.KR(years=d.year)


def is_trading_window(now=None):
    now = now or datetime.now(KST)
    start = now.replace(hour=TRADE_WINDOW_START[0], minute=TRADE_WINDOW_START[1], second=0, microsecond=0)
    end = now.replace(hour=TRADE_WINDOW_END[0], minute=TRADE_WINDOW_END[1], second=0, microsecond=0)
    return start <= now <= end


# ========== FA API ==========

def fetch_fa_token():
    if FA_TOKEN_FILE.exists():
        try:
            return json.loads(FA_TOKEN_FILE.read_text())["token"]
        except Exception:
            pass
    r = requests.post(f"{FA_BASE_URL}/api/auth/login",
                      json={"username": FA_USERNAME, "password": FA_PASSWORD}, timeout=10)
    r.raise_for_status()
    token = r.json()["accessToken"]
    FA_TOKEN_FILE.write_text(json.dumps({"token": token}))
    return token


def fetch_company_weights():
    token = fetch_fa_token()
    headers = {"Authorization": f"Bearer {token}"}
    weights = {}
    for product_code, label in [(PRODUCT_18, "18"), (PRODUCT_25, "25")]:
        r = requests.get(f"{FA_BASE_URL}/api/main/model/portfolio/{product_code}", headers=headers, timeout=10)
        if r.status_code == 401:
            FA_TOKEN_FILE.unlink(missing_ok=True)
            token = fetch_fa_token()
            headers = {"Authorization": f"Bearer {token}"}
            r = requests.get(f"{FA_BASE_URL}/api/main/model/portfolio/{product_code}", headers=headers, timeout=10)
        r.raise_for_status()
        d = r.json()
        weights[label] = {p["stockShortCode"]: float(p["weight"]) for p in d["products"]}
        weights[f"{label}_names"] = {p["stockShortCode"]: p["stockName"] for p in d["products"]}
    return weights


# ========== 비중 계산 ==========

def compute_target_qty(weights, prices, total_asset):
    w18 = weights["18"]
    w25 = weights["25"]
    names = {**weights["18_names"], **weights["25_names"]}
    union = sorted(set(w18) | set(w25))
    avg = {}
    for code in union:
        if code in w18 and code in w25:
            avg[code] = (w18[code] + w25[code]) / 2
        elif code in w25:
            avg[code] = w25[code]
        else:
            avg[code] = w18[code]

    threshold = total_asset * AFFORDABLE_THRESHOLD_PCT
    affordable = [c for c in union if prices.get(c, 0) > 0 and prices[c] < threshold]
    not_aff = [c for c in union if c not in affordable]
    sum_aff = sum(avg[c] for c in affordable)
    factor = 100.0 / sum_aff if sum_aff > 0 else 0.0

    target = {}
    for code in affordable:
        renorm_pct = avg[code] * factor
        target_amt = total_asset * renorm_pct / 100
        price = prices[code]
        qty = int(target_amt // price)
        target[code] = {
            "name": names.get(code, ""),
            "shares": qty,
            "renorm_pct": round(renorm_pct, 4),
            "price_at_calc": price,
        }
    return {
        "target": target,
        "affordable": affordable,
        "not_affordable": [{"code": c, "name": names.get(c, ""), "weight": avg[c], "price": prices.get(c, 0)} for c in not_aff],
        "renorm_factor": round(factor, 4),
    }


# ========== diff ==========

def load_last_target():
    if not TARGET_CACHE.exists():
        return None
    return json.loads(TARGET_CACHE.read_text())


def save_last_target(data):
    TARGET_CACHE.parent.mkdir(parents=True, exist_ok=True)
    TARGET_CACHE.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def weights_changed(prev, curr):
    """직전 raw_weights와 현재 비교. 0.005%p 이상 차이면 변경."""
    if not prev:
        return True
    for label in ("18", "25"):
        a = prev.get("raw_weights", {}).get(label, {})
        b = curr.get(label, {})
        if set(a) != set(b):
            return True
        for k in a:
            if abs(float(a[k]) - float(b[k])) > 0.005:
                return True
    return False


# ========== 매매 ==========

def compute_orders(current_holdings, target_qty):
    """현재 holdings vs 목표 → 매도/매수 주문 리스트."""
    sells, buys = [], []
    target_codes = set(target_qty.keys())
    held_codes = {tk.split(".")[0] for tk in current_holdings.keys()}

    # 매도: 보유 중인데 목표에 없거나 수량 초과
    for ticker, h in current_holdings.items():
        code = ticker.split(".")[0]
        target_share = target_qty.get(code, {}).get("shares", 0)
        diff = h["shares"] - target_share
        if diff > 0:
            sells.append({
                "code": code, "ticker": ticker, "name": h["name"],
                "qty": diff, "current_qty": h["shares"], "target_qty": target_share,
            })
    # 매수: 목표에 있는데 보유가 부족
    for code, t in target_qty.items():
        ticker = f"{code}.KS"
        current_share = current_holdings.get(ticker, {}).get("shares", 0)
        diff = t["shares"] - current_share
        if diff > 0:
            buys.append({
                "code": code, "ticker": ticker, "name": t["name"],
                "qty": diff, "current_qty": current_share, "target_qty": t["shares"],
            })
    return sells, buys


def execute_orders(kis, sells, buys, dry_run=False):
    """매도 먼저, 그다음 매수. 시장가 주문."""
    results = {"sells": [], "buys": [], "errors": []}
    for order in sells:
        if dry_run:
            logger.info(f"  [dry-run] SELL {order['name']}({order['code']}) x{order['qty']}")
            results["sells"].append({**order, "order_no": None, "dry_run": True})
            continue
        try:
            r = kis.place_order(order["code"], order["qty"], price=0, side="sell")
            results["sells"].append({**order, "order_no": r["order_no"]})
            logger.info(f"  SELL {order['name']} x{order['qty']} 주문 OK ({r['order_no']})")
        except Exception as e:
            results["errors"].append(f"매도 실패 {order['code']}: {e}")
            logger.error(f"  매도 실패 {order['code']}: {e}")
        time.sleep(0.3)

    if not dry_run and sells:
        time.sleep(2)  # 매도 체결 대기 (현금 확보)

    for order in buys:
        if dry_run:
            logger.info(f"  [dry-run] BUY {order['name']}({order['code']}) x{order['qty']}")
            results["buys"].append({**order, "order_no": None, "dry_run": True})
            continue
        try:
            r = kis.place_order(order["code"], order["qty"], price=0, side="buy")
            results["buys"].append({**order, "order_no": r["order_no"]})
            logger.info(f"  BUY {order['name']} x{order['qty']} 주문 OK ({r['order_no']})")
        except Exception as e:
            results["errors"].append(f"매수 실패 {order['code']}: {e}")
            logger.error(f"  매수 실패 {order['code']}: {e}")
        time.sleep(0.3)
    return results


# ========== DB 갱신 ==========

def reconcile_from_kis_and_update_db(kis, date_str, trades_summary):
    """매매 후 KIS 실잔고로 portfolios.UF + transactions 갱신.

    KIS get_holdings() 결과를 source of truth로 사용.
    """
    time.sleep(3)
    kis_holdings = kis.get_holdings()
    kis_balance = kis.get_balance()

    # holdings dict 구성
    new_holdings = {}
    for h in kis_holdings:
        ticker = h["ticker"]  # .KS 형식
        new_holdings[ticker] = {
            "name": h["name"],
            "shares": h["shares"],
            "avg_price": h["avg_price"],
        }
    new_cash = kis_balance["cash_d2"]  # D+2 정산 반영 예수금
    total_asset_after = kis_balance["total_asset"]

    # portfolios.UF 갱신
    supabase.table("portfolios").update({
        "cash": new_cash,
        "holdings": new_holdings,
        "last_rebalanced": date_str,
    }).eq("investor_id", INVESTOR_ID).execute()

    # transactions insert (매도/매수 각각)
    season_id = get_current_season_id()
    now_iso = datetime.now(KST).isoformat()
    tx_rows = []
    for s in trades_summary.get("sells", []):
        # KIS get_current_price 안 쓰고 holdings에서 매도 후 평균 추출 어려움 → 별도 조회
        try:
            cp = kis.get_current_price(s["code"])
            exec_price = cp["price"]
        except Exception:
            exec_price = s.get("price_at_calc", 0)
        amount = s["qty"] * exec_price
        fee = round(amount * SELL_FEE_RATE) + round(amount * SELL_TAX_RATE)
        tx_rows.append({
            "investor_id": INVESTOR_ID, "date": date_str, "type": "sell",
            "ticker": s["ticker"], "name": s["name"], "shares": s["qty"],
            "price": exec_price, "amount": amount, "fee": fee, "profit": None,
            "executed_at": now_iso, "season_id": season_id,
        })
    for b in trades_summary.get("buys", []):
        try:
            cp = kis.get_current_price(b["code"])
            exec_price = cp["price"]
        except Exception:
            exec_price = b.get("price_at_calc", 0)
        amount = b["qty"] * exec_price
        fee = round(amount * BUY_FEE_RATE)
        tx_rows.append({
            "investor_id": INVESTOR_ID, "date": date_str, "type": "buy",
            "ticker": b["ticker"], "name": b["name"], "shares": b["qty"],
            "price": exec_price, "amount": amount, "fee": fee, "profit": None,
            "executed_at": now_iso, "season_id": season_id,
        })
    if tx_rows:
        supabase.table("transactions").insert(tx_rows).execute()

    # rebalance_history insert
    trade_log = [{"type": "sell", "ticker": s["ticker"], "shares": s["qty"]} for s in trades_summary.get("sells", [])] + \
                [{"type": "buy", "ticker": b["ticker"], "shares": b["qty"]} for b in trades_summary.get("buys", [])]
    supabase.table("rebalance_history").insert({
        "investor_id": INVESTOR_ID, "date": date_str,
        "trades": trade_log, "total_asset_after": total_asset_after,
        "season_id": season_id,
    }).execute()

    # portfolio_snapshots upsert
    supabase.table("portfolio_snapshots").upsert({
        "investor_id": INVESTOR_ID, "date": date_str,
        "holdings": new_holdings, "cash": new_cash,
        "total_asset": total_asset_after, "snapshot_at": now_iso,
        "season_id": season_id,
    }).execute()

    return {"cash": new_cash, "holdings": new_holdings, "total_asset": total_asset_after}


# ========== 메인 ==========

def main(force=False, dry_run=False):
    today = datetime.now(KST).date()
    date_str = today.isoformat()
    logger.info(f"=== C 옵션 한국 매크로 추종 cron 시작 ({date_str}) ===")

    # 가드 1: 휴장일
    if not is_market_day(today) and not force:
        logger.info(f"휴장일 ({today.strftime('%A')}) — 스킵")
        return

    # 가드 2: 장 운영시간
    if not is_trading_window() and not dry_run and not force:
        logger.info("장 운영시간(09:10~14:30) 외 — 스킵")
        return

    # 가드 3: 킬스위치 (dry-run/force는 우회)
    if check_kill_switch() and not (dry_run or force):
        logger.warning("킬스위치 활성화 — 매매 차단")
        send_telegram(f"⚠️ *C 옵션 추종 차단* ({date_str})\n킬스위치가 활성화되어 매매를 건너뛰었습니다.")
        return
    if check_kill_switch() and (dry_run or force):
        logger.info("킬스위치 활성화 상태이지만 dry-run/force 모드라 우회")

    # 1. 회사 비중 조회
    try:
        weights = fetch_company_weights()
        logger.info(f"회사 비중 조회: 18판 {len(weights['18'])}종목, 25판 {len(weights['25'])}종목")
    except Exception as e:
        logger.error(f"회사 비중 조회 실패: {e}")
        send_telegram(f"⚠️ *C 옵션 추종 오류* ({date_str})\n회사 비중 조회 실패: {e}")
        return

    # 2. diff 비교
    prev = load_last_target()
    changed = weights_changed(prev, {"18": weights["18"], "25": weights["25"]})
    if not changed and not force:
        logger.info("✅ 회사 포트폴리오 변경 없음 — 매매 스킵")
        return

    if changed and prev is not None:
        logger.info("🔔 회사 포트폴리오 변경 감지 — 리밸런싱 진행")

    # 3. 현재 포트폴리오 + 가격 조회
    pf_row = supabase.table("portfolios").select("*").eq("investor_id", INVESTOR_ID).single().execute().data
    current_holdings = pf_row.get("holdings") or {}
    cash = int(pf_row.get("cash", 0))

    kis = KISClient()
    # 25종목 가격 일괄 조회
    all_codes = sorted(set(weights["18"]) | set(weights["25"]))
    prices = {}
    for c in all_codes:
        try:
            prices[c] = kis.get_current_price(c)["price"]
        except Exception as e:
            logger.warning(f"가격 조회 실패 {c}: {e}")
            prices[c] = 0
        time.sleep(0.1)

    # 총자산 = cash + 보유종목 시가
    total_asset = cash
    for tk, h in current_holdings.items():
        code = tk.split(".")[0]
        if prices.get(code, 0) > 0:
            total_asset += h["shares"] * prices[code]
    logger.info(f"총자산 평가: {total_asset:,}원 (cash {cash:,} + 보유 {total_asset-cash:,})")

    # 4. 목표 수량 계산
    target_info = compute_target_qty(weights, prices, total_asset)
    target = target_info["target"]

    # 5. 매매 주문 생성
    sells, buys = compute_orders(current_holdings, target)
    if not sells and not buys:
        logger.info("✅ 매매 대상 0건 (현재 보유와 목표 일치)")
        save_last_target({
            "fetched_at": datetime.now(KST).isoformat(),
            "raw_weights": {"18": weights["18"], "25": weights["25"]},
            "target_qty": {c: t["shares"] for c, t in target.items()},
            "total_asset_at_calc": total_asset,
        })
        return

    logger.info(f"매매 주문: 매도 {len(sells)}건, 매수 {len(buys)}건")
    for s in sells:
        logger.info(f"  SELL {s['name']}({s['code']}) {s['current_qty']}주 → {s['target_qty']}주 ({s['qty']}주 매도)")
    for b in buys:
        logger.info(f"  BUY  {b['name']}({b['code']}) {b['current_qty']}주 → {b['target_qty']}주 ({b['qty']}주 매수)")

    # 6. 매매 실행
    trades_summary = execute_orders(kis, sells, buys, dry_run=dry_run)

    if dry_run:
        logger.info("dry-run 모드 — DB 갱신 / 알림 / 캐시 저장 스킵")
        return

    # 7. DB 갱신
    final = reconcile_from_kis_and_update_db(kis, date_str, trades_summary)

    # 8. 캐시 저장
    save_last_target({
        "fetched_at": datetime.now(KST).isoformat(),
        "raw_weights": {"18": weights["18"], "25": weights["25"]},
        "target_qty": {c: t["shares"] for c, t in target.items()},
        "total_asset_at_calc": total_asset,
    })

    # 9. 텔레그램 알림
    err = trades_summary.get("errors", [])
    msg_lines = [
        f"🔔 *C 옵션 추종 리밸런싱* ({date_str})",
        f"매도 {len(trades_summary['sells'])}건 / 매수 {len(trades_summary['buys'])}건",
        f"총자산 {final['total_asset']:,}원 (cash {final['cash']:,})",
    ]
    if err:
        msg_lines.append(f"⚠️ 오류 {len(err)}건: " + "; ".join(err[:3]))
    send_telegram("\n".join(msg_lines))

    logger.info(f"=== 완료 (매도 {len(trades_summary['sells'])} / 매수 {len(trades_summary['buys'])} / 오류 {len(err)}) ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="매매 없이 시뮬레이션")
    parser.add_argument("--force", action="store_true", help="휴장일/장외 시간/변경 없음 무시")
    args = parser.parse_args()
    main(force=args.force, dry_run=args.dry_run)
