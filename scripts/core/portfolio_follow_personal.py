"""개인 포트폴리오 추종 알림 — KR1GBDYNAM99IKI0 (글로벌자산배분 주식100 [국내상장 ETF] / ISA)

- launchd 09:15 매일 실행
- BetterWealth FA API로 KR1GBDYNAM99IKI0 비중 조회 (일반계좌 버전 KR1GBRSERI99NKI1과 종목·비중 동일, ISA 랩핑)
- 500만 시드 기준 qty 계산 (비중 순 정렬 → round → 위에서부터 누적, 컷)
- portfolio/personal_last_target.json과 diff → 수량 변경 시 텔레그램 알림
- 알림 전용: 자동 매매 없음, DB 갱신 없음
- 사용자가 본인 신한투자증권 ISA 계좌(270-80-031639)에서 수동 매수

가드:
- 한국 휴장일 스킵 (holidays.KR)
- 장 운영시간 체크 없음 (알림만 보내니 아무 때나 OK)
- 킬스위치 체크 없음 (실전 매매 아님)
"""
import sys
import json
import argparse
import requests
from pathlib import Path
from datetime import datetime, timezone, timedelta

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "notifications"))

import holidays

from broker_client import KISClient
from logger import get_logger
from send_telegram import send_telegram

logger = get_logger(__name__)

KST = timezone(timedelta(hours=9))
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
TARGET_CACHE = PROJECT_ROOT / "portfolio" / "personal_last_target.json"
FA_TOKEN_FILE = PROJECT_ROOT / "portfolio" / ".fa_token.json"
FA_BASE_URL = "https://fa.betterwealth.co.kr"
FA_USERNAME = "qb.test@qbgroup.co.kr"
FA_PASSWORD = "qbgroup@01"
PRODUCT_CODE = "KR1GBDYNAM99IKI0"
PRODUCT_LABEL = "글로벌자산배분 주식100 [국내상장 ETF] (ISA)"
SEED = 5_000_000


def is_market_day(d):
    if d.weekday() >= 5:
        return False
    return d not in holidays.KR(years=d.year)


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
    """KR1GBRSERI99NKI1 비중 조회. {"weights": {code: pct}, "names": {code: name}}."""
    token = fetch_fa_token()
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{FA_BASE_URL}/api/main/model/portfolio/{PRODUCT_CODE}", headers=headers, timeout=10)
    if r.status_code == 401:
        FA_TOKEN_FILE.unlink(missing_ok=True)
        token = fetch_fa_token()
        headers = {"Authorization": f"Bearer {token}"}
        r = requests.get(f"{FA_BASE_URL}/api/main/model/portfolio/{PRODUCT_CODE}", headers=headers, timeout=10)
    r.raise_for_status()
    d = r.json()
    return {
        "weights": {p["stockShortCode"]: float(p["weight"]) for p in d["products"]},
        "names": {p["stockShortCode"]: p["stockName"] for p in d["products"]},
    }


def compute_target_qty(weights_data, prices, seed):
    """비중 순 정렬 → round(시드×비중/가격) → 위에서부터 누적, 시드 초과 시 컷."""
    weights = weights_data["weights"]
    names = weights_data["names"]
    ordered = sorted(weights.items(), key=lambda x: -x[1])

    target = {}
    cash = seed
    stopped = False

    for code, w_pct in ordered:
        price = prices.get(code, 0)
        if price <= 0 or stopped:
            continue

        target_amt = seed * w_pct / 100
        qty = round(target_amt / price)
        cost = qty * price

        if cost > cash:
            qty = int(cash // price)
            stopped = True
            if qty <= 0:
                continue
            cost = qty * price

        if qty <= 0:
            continue

        target[code] = {
            "name": names.get(code, ""),
            "shares": qty,
            "weight_pct": w_pct,
            "price": price,
        }
        cash -= cost

    return {"target": target, "remaining_cash": cash, "spent": seed - cash}


def load_last_target():
    if not TARGET_CACHE.exists():
        return None
    return json.loads(TARGET_CACHE.read_text())


def save_last_target(data):
    TARGET_CACHE.parent.mkdir(parents=True, exist_ok=True)
    TARGET_CACHE.write_text(json.dumps(data, ensure_ascii=False, indent=2))


def compute_diff(prev_qty, curr_target):
    """이전 캐시의 qty vs 현재 목표 qty 비교. 종목별 (+매수/−매도) 리스트."""
    prev = prev_qty or {}
    changes = []
    all_codes = set(prev) | set(curr_target)
    for code in all_codes:
        prev_share = prev.get(code, 0)
        curr_share = curr_target.get(code, {}).get("shares", 0)
        diff = curr_share - prev_share
        if diff != 0:
            changes.append({
                "code": code,
                "name": curr_target.get(code, {}).get("name", ""),
                "prev": prev_share,
                "curr": curr_share,
                "diff": diff,
            })
    changes.sort(key=lambda x: (-abs(x["diff"]), x["code"]))
    return changes


def format_initial_message(target_info):
    target = target_info["target"]
    lines = [
        f"🆕 *개인 포트폴리오 초기 매수*",
        f"_{PRODUCT_LABEL}_",
        f"시드 {SEED:,}원",
        "",
        "아래 종목을 본인 신한투자증권 ISA 계좌(270-80-031639)에서 매수하세요:",
        "",
    ]
    ordered = sorted(target.items(), key=lambda x: -x[1]["weight_pct"])
    for code, t in ordered:
        lines.append(f"• `{code}` {t['name']}")
        lines.append(f"   {t['shares']}주 × {t['price']:,}원 = {t['shares']*t['price']:,}원 ({t['weight_pct']:.2f}%)")
    lines.append("")
    lines.append(f"매수 합계 {target_info['spent']:,}원 / 잔여 {target_info['remaining_cash']:,}원")
    return "\n".join(lines)


def format_rebalance_message(changes, target_info):
    sells = [c for c in changes if c["diff"] < 0]
    buys = [c for c in changes if c["diff"] > 0]
    lines = [
        f"🔔 *개인 포트폴리오 리밸런싱 신호*",
        f"_{PRODUCT_LABEL}_",
        "회사 비중 변경 감지 — 본인 계좌에서 조정 필요:",
        "",
    ]
    if sells:
        lines.append("📉 *매도*")
        for c in sells:
            lines.append(f"• `{c['code']}` {c['name']}: {c['prev']}주 → {c['curr']}주 ({c['diff']:+d}주)")
        lines.append("")
    if buys:
        lines.append("📈 *매수*")
        for c in buys:
            lines.append(f"• `{c['code']}` {c['name']}: {c['prev']}주 → {c['curr']}주 ({c['diff']:+d}주)")
        lines.append("")
    lines.append("전체 목표 (참고):")
    target = target_info["target"]
    ordered = sorted(target.items(), key=lambda x: -x[1]["weight_pct"])
    for code, t in ordered:
        lines.append(f"• `{code}` {t['shares']}주 ({t['weight_pct']:.2f}%)")
    return "\n".join(lines)


def main(force=False, dry_run=False):
    today = datetime.now(KST).date()
    date_str = today.isoformat()
    logger.info(f"=== 개인 포트폴리오 추종 cron 시작 ({date_str}) ===")

    if not is_market_day(today) and not force:
        logger.info(f"휴장일 ({today.strftime('%A')}) — 스킵")
        return

    try:
        weights_data = fetch_company_weights()
        logger.info(f"회사 비중 조회: {PRODUCT_CODE} {len(weights_data['weights'])}종목")
    except Exception as e:
        logger.error(f"회사 비중 조회 실패: {e}")
        if not dry_run:
            send_telegram(f"⚠️ *개인 포트폴리오 추종 오류* ({date_str})\n비중 조회 실패: {e}")
        return

    kis = KISClient()
    prices = {}
    for code in weights_data["weights"]:
        try:
            prices[code] = kis.get_current_price(code)["price"]
        except Exception as e:
            logger.warning(f"가격 조회 실패 {code}: {e}")
            prices[code] = 0

    target_info = compute_target_qty(weights_data, prices, SEED)
    target = target_info["target"]
    curr_qty = {c: t["shares"] for c, t in target.items()}

    prev = load_last_target()
    is_initial = prev is None

    if is_initial:
        logger.info("초기 실행 — 최초 매수 안내 발송")
        msg = format_initial_message(target_info)
    else:
        changes = compute_diff(prev.get("target_qty", {}), target)
        if not changes and not force:
            logger.info("✅ 목표 수량 변경 없음 — 알림 스킵")
            return
        if not changes and force:
            logger.info("변경 없지만 force — 리밸런싱 메시지 생성")
            changes = []
        logger.info(f"🔔 목표 수량 변경 감지: {len(changes)}종목")
        msg = format_rebalance_message(changes, target_info)

    if dry_run:
        logger.info("dry-run 모드 — 캐시 저장 / 텔레그램 발송 스킵")
        print("\n--- 메시지 미리보기 ---\n" + msg + "\n---")
        return

    send_telegram(msg)

    save_last_target({
        "fetched_at": datetime.now(KST).isoformat(),
        "product_code": PRODUCT_CODE,
        "seed": SEED,
        "raw_weights": weights_data["weights"],
        "target_qty": curr_qty,
        "prices_at_calc": {c: prices.get(c, 0) for c in target},
    })

    logger.info("=== 완료 ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="텔레그램/캐시 없이 미리보기")
    parser.add_argument("--force", action="store_true", help="휴장일/변경 없음 무시")
    args = parser.parse_args()
    main(force=args.force, dry_run=args.dry_run)
