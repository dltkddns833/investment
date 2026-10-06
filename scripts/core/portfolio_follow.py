"""C 옵션 한국 매크로 추종 — 매일 회사 비중 변경 감지 + 사용자 요청 시 KIS 매매

- 기본 실행(cron): 변경 감지 시 텔레그램 알림만, 매매 없음
- --execute: 사용자가 직접 실행 → 변경된 비중대로 매매
- DB(Supabase) 미사용 — 보유/잔고는 KIS 기준

- launchd 09:10 매일 실행 (스토리텔링 충돌 회피)
- BetterWealth FA 18판(KR2KRFACTR99NKI1) "한국 매크로 로테이션" 단일 추종
- 비중 순 정렬 → qty = round(시드×비중/가격) → 위에서부터 누적, 남은 현금 초과 시 컷
- portfolio/last_target.json과 diff → 변경 시 알림 / --execute 시 KIS 시장가 매도/매수
- 텔레그램 알림

가드:
- 한국 휴장일 스킵 (holidays.KR)
- 장 운영시간 09:10~14:30 외 스킵
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

from broker_client import KISClient
from logger import get_logger
from send_telegram import send_telegram

logger = get_logger(__name__)

KST = timezone(timedelta(hours=9))
INVESTOR_NAME = "이상운"
STRATEGY = "한국 매크로 로테이션 추종"
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
TARGET_CACHE = PROJECT_ROOT / "portfolio" / "last_target.json"
FA_TOKEN_FILE = PROJECT_ROOT / "portfolio" / ".fa_token.json"
FA_BASE_URL = "https://fa.betterwealth.co.kr"
FA_USERNAME = "qb.test@qbgroup.co.kr"
FA_PASSWORD = "qbgroup@01"
PRODUCT_18 = "KR2KRMCROR99NKI1"  # 한국 매크로 로테이션 [국내상장 주식] (2026-08-03 상품코드 변경: KR2KRFACTR99NKI1 → KR2KRMCROR99NKI1)
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
    """18판(KR2KRFACTR99NKI1) "한국 매크로 로테이션" 비중 조회.

    Returns: {"weights": {code: pct, ...}, "names": {code: name, ...}}
    """
    token = fetch_fa_token()
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{FA_BASE_URL}/api/main/model/portfolio/{PRODUCT_18}", headers=headers, timeout=10)
    if r.status_code == 401:
        FA_TOKEN_FILE.unlink(missing_ok=True)
        token = fetch_fa_token()
        headers = {"Authorization": f"Bearer {token}"}
        r = requests.get(f"{FA_BASE_URL}/api/main/model/portfolio/{PRODUCT_18}", headers=headers, timeout=10)
    r.raise_for_status()
    d = r.json()
    return {
        "weights": {p["stockShortCode"]: float(p["weight"]) for p in d["products"]},
        "names": {p["stockShortCode"]: p["stockName"] for p in d["products"]},
    }


# ========== 비중 계산 ==========

def compute_target_qty(weights_data, prices, total_asset):
    """옵션 Y 산식 — 비중 순 정렬 → round(시드×비중/가격) → 위에서부터 누적, 컷.

    1. 비중 큰 종목부터 정렬
    2. 각 종목 qty = round(시드 × 비중% / 100 / 가격) (0.5 이상이면 1주)
    3. 누적 매수액이 시드를 초과하면 그 종목에서 floor(남은현금/가격)만 사고 이후 컷
    """
    weights = weights_data["weights"]
    names = weights_data["names"]
    ordered = sorted(weights.items(), key=lambda x: -x[1])

    target = {}
    skipped = []
    cash = total_asset
    stopped = False

    for code, w_pct in ordered:
        price = prices.get(code, 0)
        if price <= 0:
            skipped.append({"code": code, "name": names.get(code, ""), "weight": w_pct, "reason": "no_price"})
            continue
        if stopped:
            skipped.append({"code": code, "name": names.get(code, ""), "weight": w_pct, "reason": "cut"})
            continue

        target_amt = total_asset * w_pct / 100
        qty = round(target_amt / price)
        cost = qty * price

        if cost > cash:
            qty = int(cash // price)
            stopped = True
            if qty <= 0:
                skipped.append({"code": code, "name": names.get(code, ""), "weight": w_pct, "reason": "cut"})
                continue
            cost = qty * price

        if qty <= 0:
            skipped.append({"code": code, "name": names.get(code, ""), "weight": w_pct, "reason": "round=0"})
            continue

        target[code] = {
            "name": names.get(code, ""),
            "shares": qty,
            "weight_pct": w_pct,
            "price_at_calc": price,
        }
        cash -= cost

    return {"target": target, "skipped": skipped, "remaining_cash": cash}


# ========== diff ==========

def load_last_target():
    if not TARGET_CACHE.exists():
        return None
    return json.loads(TARGET_CACHE.read_text())


def save_last_target(data):
    TARGET_CACHE.parent.mkdir(parents=True, exist_ok=True)
    TARGET_CACHE.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def weights_changed(prev, curr):
    """직전 raw_weights(단일 dict)와 현재 비교. 0.005%p 이상 차이면 변경.

    구조 변경 (이전: {"18": {...}, "25": {...}} → 현재: {code: pct})에도 대응:
    prev의 raw_weights가 dict-of-dicts면 무조건 변경으로 처리.
    """
    if not prev:
        return True
    prev_raw = prev.get("raw_weights", {})
    if prev_raw and any(isinstance(v, dict) for v in prev_raw.values()):
        # 옛 구조 → 새 구조 첫 진입 → 무조건 리밸런싱
        return True
    if set(prev_raw) != set(curr):
        return True
    for k in prev_raw:
        if abs(float(prev_raw[k]) - float(curr[k])) > 0.005:
            return True
    return False


# ========== 매매 ==========

def compute_orders(current_holdings, target_qty):
    """현재 holdings vs 목표 → 매도/매수 주문 리스트."""
    sells, buys = [], []
    target_codes = set(target_qty.keys())
    held_by_code = {tk.split(".")[0]: h for tk, h in current_holdings.items()}

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
        current_share = held_by_code.get(code, {}).get("shares", 0)
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


# ========== 매매 후 잔고 ==========

def fetch_final_balance(kis):
    """매매 후 KIS 실잔고 조회."""
    time.sleep(3)
    kis_balance = kis.get_balance()
    return {"cash": kis_balance["cash_d2"], "total_asset": kis_balance["total_asset"]}


# ========== 메인 ==========

def format_weight_changes(prev, weights_data):
    """직전 비중 대비 변경 내역 텍스트"""
    prev_raw = (prev or {}).get("raw_weights", {})
    if any(isinstance(v, dict) for v in prev_raw.values()):
        prev_raw = {}
    curr = weights_data["weights"]
    names = weights_data["names"]
    lines = []
    for code in sorted(set(prev_raw) | set(curr), key=lambda c: -curr.get(c, 0)):
        a, b = float(prev_raw.get(code, 0)), float(curr.get(code, 0))
        if abs(a - b) > 0.005:
            lines.append(f"• {names.get(code, code)}: {a:.2f}% → {b:.2f}%")
    return "\n".join(lines)


def main(force=False, dry_run=False, execute=False):
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

    # 1. 회사 비중 조회 (18판 단일)
    try:
        weights_data = fetch_company_weights()
        logger.info(f"회사 비중 조회: 18판 {len(weights_data['weights'])}종목")
    except Exception as e:
        logger.error(f"회사 비중 조회 실패: {e}")
        send_telegram(f"⚠️ *C 옵션 추종 오류* ({date_str})\n회사 비중 조회 실패: {e}")
        return

    # 2. diff 비교
    prev = load_last_target()
    changed = weights_changed(prev, weights_data["weights"])
    if not changed and not force:
        logger.info("✅ 회사 포트폴리오 변경 없음 — 매매 스킵")
        return

    if changed and prev is not None:
        logger.info("🔔 회사 포트폴리오 변경 감지")

    # 기본 실행(cron)은 감지 알림만 — 매매는 사용자가 --execute로 요청
    if not (execute or dry_run):
        logger.info("감지 전용 모드 — 알림 후 종료 (매매하려면 --execute)")
        send_telegram(
            f"🔔 *C 옵션 포트폴리오 변경 감지* ({date_str})\n"
            f"{format_weight_changes(prev, weights_data)}\n\n"
            f"매매하려면 장중(09:10~14:30)에 실행:\n"
            f"`portfolio_follow.py --execute`"
        )
        return

    # 3. 현재 보유(KIS 기준) + 가격 조회
    kis = KISClient()
    current_holdings = {
        h["ticker"]: {"name": h["name"], "shares": h["shares"]}
        for h in kis.get_holdings()
    }

    # 18판 종목 가격 일괄 조회
    all_codes = sorted(weights_data["weights"].keys())
    prices = {}
    for c in all_codes:
        try:
            prices[c] = kis.get_current_price(c)["price"]
        except Exception as e:
            logger.warning(f"가격 조회 실패 {c}: {e}")
            prices[c] = 0
        time.sleep(0.1)

    # 총자산 = KIS get_balance().total_asset (미정산 매도금까지 포함된 정확한 값)
    balance = kis.get_balance()
    total_asset = balance["total_asset"]
    cash = balance["cash"]
    logger.info(f"총자산 평가(KIS): {total_asset:,}원 (D+0 cash {cash:,})")

    # 4. 목표 수량 계산
    target_info = compute_target_qty(weights_data, prices, total_asset)
    target = target_info["target"]

    # 5. 매매 주문 생성
    sells, buys = compute_orders(current_holdings, target)
    if not sells and not buys:
        logger.info("✅ 매매 대상 0건 (현재 보유와 목표 일치)")
        save_last_target({
            "fetched_at": datetime.now(KST).isoformat(),
            "raw_weights": weights_data["weights"],
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
        logger.info("dry-run 모드 — 알림 / 캐시 저장 스킵")
        return

    # 7. 매매 후 잔고
    final = fetch_final_balance(kis)

    # 8. 캐시 저장
    save_last_target({
        "fetched_at": datetime.now(KST).isoformat(),
        "raw_weights": weights_data["weights"],
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
    parser.add_argument("--execute", action="store_true", help="변경된 비중대로 실제 매매 (기본은 감지 알림만)")
    args = parser.parse_args()
    main(force=args.force, dry_run=args.dry_run, execute=args.execute)
