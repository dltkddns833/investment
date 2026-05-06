"""
Q 정채원 청산 룰 grid search 백테스트.

5/4·5/6 실제 매매 14건의 30분 보유 구간을 KIS 1분봉으로 한 번 캐시한 뒤,
다양한 룰 파라미터 조합으로 청산 시뮬을 돌려 손익을 비교한다.

테스트 변수:
  - stop_loss_pct       : -2.0, -2.5, -3.0
  - trailing_activate   : +2.0, +3.0, +4.0, +5.0
  - trailing_pullback   : 0.5, 1.0, 1.5  (peak에서 -Xp 되돌림)
  - hold_duration_min   : 15, 20, 30
  - stuck_check         : (분, 손익률) — 매수 후 N분 안에 X% 못 넘으면 조기 청산
                          None 이면 비활성

베이스라인: SL=-3.0, TA=+5.0, PB=1.0, HOLD=30, stuck=None (현행 q_monitor 룰)
"""
import sys
import json
from pathlib import Path
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from itertools import product

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "core"))

from broker_client import KISClient
from supabase_client import supabase

KST = ZoneInfo("Asia/Seoul")
CACHE_PATH = Path(__file__).parent / ".q_bars_cache.json"

FEE_RATE = 0.00015
TAX_RATE = 0.0018
SLIPPAGE = 0.0005


def parse_kst(ts):
    s = ts.replace("Z", "+00:00")
    if "." in s and "+" in s:
        head, rest = s.split(".", 1)
        frac, tz = rest.split("+", 1)
        frac = (frac + "000000")[:6]
        s = f"{head}.{frac}+{tz}"
    return datetime.fromisoformat(s).astimezone(KST)


def fetch_pairs(dates):
    rows = (
        supabase.table("transactions")
        .select("id, date, type, ticker, name, shares, price, amount, profit, fee, executed_at")
        .eq("investor_id", "Q")
        .in_("date", dates)
        .order("executed_at")
        .execute()
        .data
    )
    pairs = []
    open_pos = None
    for r in rows:
        if r["type"] == "buy":
            open_pos = r
        elif r["type"] == "sell" and open_pos:
            pairs.append({"buy": open_pos, "sell": r})
            open_pos = None
    return pairs


def fetch_bars_cached(pairs):
    """각 매매 쌍의 30분 윈도우 분봉을 받아 캐시."""
    if CACHE_PATH.exists():
        with open(CACHE_PATH) as f:
            return json.load(f)

    client = KISClient()
    cache = {}
    for p in pairs:
        buy = p["buy"]
        buy_dt = parse_kst(buy["executed_at"])
        date_str = buy_dt.strftime("%Y%m%d")
        end_dt = buy_dt + timedelta(minutes=35)  # 여유 +5분
        hour_str = (end_dt + timedelta(minutes=2)).strftime("%H%M%S")
        bars = client.get_minute_chart(buy["ticker"], date_str, hour_str=hour_str)
        cache[str(buy["id"])] = {
            "buy_dt": buy_dt.isoformat(),
            "avg_price": buy["price"],
            "shares": buy["shares"],
            "bars": bars,
        }
    with open(CACHE_PATH, "w") as f:
        json.dump(cache, f)
    return cache


def simulate(pair, bars_data, params):
    """주어진 룰로 청산 시뮬."""
    buy_dt = datetime.fromisoformat(bars_data["buy_dt"])
    avg_price = bars_data["avg_price"]
    end_dt = buy_dt + timedelta(minutes=params["hold"])

    # bar 윈도우 추출 + 정렬
    window = []
    for b in bars_data["bars"]:
        t = b["time"].zfill(6)
        bar_dt = buy_dt.replace(
            hour=int(t[0:2]), minute=int(t[2:4]), second=0, microsecond=0
        )
        if bar_dt < buy_dt or bar_dt > end_dt:
            continue
        window.append((bar_dt, b))
    window.sort(key=lambda x: x[0])

    peak_pct = 0.0
    trailing_active = False
    last_close = avg_price
    last_dt = buy_dt

    SL = params["sl"]
    TA = params["ta"]
    PB = params["pb"]
    stuck = params.get("stuck")  # (minutes, pct) or None

    for bar_dt, b in window:
        high = b["high"]
        low = b["low"]
        close = b["close"]
        last_close = close
        last_dt = bar_dt

        elapsed = (bar_dt - buy_dt).total_seconds() / 60
        high_pct = (high / avg_price - 1) * 100
        low_pct = (low / avg_price - 1) * 100
        close_pct = (close / avg_price - 1) * 100

        # 손절 (분 내 저가가 SL 이하)
        if low_pct <= SL:
            return {
                "exit_pct": SL,
                "exit_price": int(avg_price * (1 + SL / 100)),
                "reason": "손절",
                "peak": peak_pct,
                "elapsed": elapsed,
            }

        # peak 갱신
        if high_pct > peak_pct:
            peak_pct = high_pct

        # 트레일링 활성화
        if not trailing_active and peak_pct >= TA:
            trailing_active = True

        # 트레일링 청산
        if trailing_active and close_pct <= peak_pct - PB:
            return {
                "exit_pct": close_pct,
                "exit_price": close,
                "reason": "트레일링",
                "peak": peak_pct,
                "elapsed": elapsed,
            }

        # 조기 청산: 매수 후 N분 경과 시점에 X% 미만이면 청산
        if stuck:
            stuck_min, stuck_pct = stuck
            if elapsed >= stuck_min and close_pct < stuck_pct and not trailing_active:
                return {
                    "exit_pct": close_pct,
                    "exit_price": close,
                    "reason": "조기청산",
                    "peak": peak_pct,
                    "elapsed": elapsed,
                }

    # 보유시간 만료
    final_pct = (last_close / avg_price - 1) * 100
    return {
        "exit_pct": final_pct,
        "exit_price": last_close,
        "reason": "강제청산",
        "peak": peak_pct,
        "elapsed": (last_dt - buy_dt).total_seconds() / 60,
    }


def calc_profit(buy_price, sell_price, shares):
    buy_eff = buy_price * (1 + SLIPPAGE)
    sell_eff = sell_price * (1 - SLIPPAGE)
    buy_amount = int(buy_eff * shares)
    sell_amount = int(sell_eff * shares)
    buy_fee = int(buy_amount * FEE_RATE)
    sell_fee = int(sell_amount * (FEE_RATE + TAX_RATE))
    return sell_amount - buy_amount - buy_fee - sell_fee


def evaluate_rule(pairs, cache, params, conservative=True, by_date=False):
    """룰 적용 시 총 손익. conservative=True면 실제 매도가가 시뮬 SL보다 낮으면 실제 손익 사용."""
    total = 0
    win = 0
    loss = 0
    per_date = {}
    for p in pairs:
        buy = p["buy"]
        sell = p["sell"]
        actual_pct = (sell["price"] / buy["price"] - 1) * 100
        bars_data = cache[str(buy["id"])]
        sim = simulate(p, bars_data, params)

        if conservative and sim["reason"] != "손절" and actual_pct <= params["sl"]:
            profit = sell["profit"]
        else:
            profit = calc_profit(buy["price"], sim["exit_price"], buy["shares"])
        total += profit
        if profit > 0:
            win += 1
        elif profit < 0:
            loss += 1
        per_date.setdefault(buy["date"], 0)
        per_date[buy["date"]] += profit
    if by_date:
        return total, win, loss, per_date
    return total, win, loss


def main():
    pairs = fetch_pairs(["2026-05-04", "2026-05-06"])
    cache = fetch_bars_cached(pairs)
    print(f"매매 사이클: {len(pairs)}건, 분봉 캐시 {len(cache)}건")

    baseline = {"sl": -3.0, "ta": 5.0, "pb": 1.0, "hold": 30, "stuck": None}
    base_total, base_w, base_l = evaluate_rule(pairs, cache, baseline)
    print(f"\n[베이스라인 (현행 q_monitor)] SL=-3.0 TA=+5.0 PB=1.0 HOLD=30")
    print(f"  손익: {base_total:+,}원  /  승 {base_w}건 패 {base_l}건")

    actual_total = sum(p["sell"]["profit"] for p in pairs)
    print(f"  (참고: 실제 거래 손익 합 {actual_total:+,}원)")

    print()
    print("=" * 110)
    print("Section A. 트레일링 활성선 변화 (SL=-3.0, PB=1.0, HOLD=30)")
    print("=" * 110)
    print(f"{'TA':<8}{'손익':<16}{'승':<5}{'패':<5}{'vs 베이스':<14}")
    for ta in [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]:
        params = {**baseline, "ta": ta}
        total, w, l = evaluate_rule(pairs, cache, params)
        delta = total - base_total
        sign = "+" if delta >= 0 else ""
        print(f"+{ta:<7.1f}{total:+,}원{'':<5}{w:<5}{l:<5}{sign}{delta:,}원")

    print()
    print("=" * 110)
    print("Section B. 손절선 변화 (TA=+5.0, PB=1.0, HOLD=30)")
    print("=" * 110)
    print(f"{'SL':<8}{'손익':<16}{'승':<5}{'패':<5}{'vs 베이스':<14}")
    for sl in [-1.5, -2.0, -2.5, -3.0, -3.5, -4.0]:
        params = {**baseline, "sl": sl}
        total, w, l = evaluate_rule(pairs, cache, params)
        delta = total - base_total
        sign = "+" if delta >= 0 else ""
        print(f"{sl:<8.1f}{total:+,}원{'':<5}{w:<5}{l:<5}{sign}{delta:,}원")

    print()
    print("=" * 110)
    print("Section C. 트레일링 풀백 변화 (SL=-3.0, TA=+5.0, HOLD=30)")
    print("=" * 110)
    print(f"{'PB':<8}{'손익':<16}{'승':<5}{'패':<5}{'vs 베이스':<14}")
    for pb in [0.5, 0.75, 1.0, 1.25, 1.5]:
        params = {**baseline, "pb": pb}
        total, w, l = evaluate_rule(pairs, cache, params)
        delta = total - base_total
        sign = "+" if delta >= 0 else ""
        print(f"{pb:<8.2f}{total:+,}원{'':<5}{w:<5}{l:<5}{sign}{delta:,}원")

    print()
    print("=" * 110)
    print("Section D. 보유시간 변화 (SL=-3.0, TA=+5.0, PB=1.0)")
    print("=" * 110)
    print(f"{'HOLD':<8}{'손익':<16}{'승':<5}{'패':<5}{'vs 베이스':<14}")
    for h in [10, 15, 20, 25, 30]:
        params = {**baseline, "hold": h}
        total, w, l = evaluate_rule(pairs, cache, params)
        delta = total - base_total
        sign = "+" if delta >= 0 else ""
        print(f"{h:<8}{total:+,}원{'':<5}{w:<5}{l:<5}{sign}{delta:,}원")

    print()
    print("=" * 110)
    print("Section E. 조기 청산 (모멘텀 검증) — 베이스에 stuck 추가")
    print("=" * 110)
    print(f"{'룰':<32}{'손익':<16}{'승':<5}{'패':<5}{'vs 베이스':<14}")
    stuck_options = [
        (5, 0.0), (5, 0.5), (5, 1.0),
        (7, 0.0), (7, 0.5), (7, 1.0),
        (10, 0.0), (10, 0.5), (10, 1.0),
        (15, 0.0), (15, 0.5), (15, 1.0),
    ]
    for stuck in stuck_options:
        params = {**baseline, "stuck": stuck}
        total, w, l = evaluate_rule(pairs, cache, params)
        delta = total - base_total
        sign = "+" if delta >= 0 else ""
        label = f"{stuck[0]}분 후 +{stuck[1]:.1f}% 미달 시 청산"
        print(f"{label:<32}{total:+,}원{'':<5}{w:<5}{l:<5}{sign}{delta:,}원")

    print()
    print("=" * 110)
    print("Section F. 풀 grid search (Top 15)")
    print("=" * 110)
    sl_grid = [-2.0, -2.5, -3.0]
    ta_grid = [2.5, 3.0, 3.5, 4.0, 5.0]
    pb_grid = [0.5, 1.0, 1.5]
    hold_grid = [15, 20, 30]
    stuck_grid = [None, (10, 0.0), (10, 0.5), (15, 0.0)]

    results = []
    for sl, ta, pb, hold, stuck in product(sl_grid, ta_grid, pb_grid, hold_grid, stuck_grid):
        params = {"sl": sl, "ta": ta, "pb": pb, "hold": hold, "stuck": stuck}
        total, w, l = evaluate_rule(pairs, cache, params)
        results.append((total, w, l, params))

    results.sort(reverse=True, key=lambda x: x[0])
    print(f"총 {len(results)}개 조합 — Top 15:")
    print(f"{'순위':<5}{'손익':<15}{'승/패':<8}{'SL':<7}{'TA':<7}{'PB':<7}{'HOLD':<7}{'stuck':<25}{'vs 베이스':<14}")
    for rank, (total, w, l, params) in enumerate(results[:15], 1):
        delta = total - base_total
        sign = "+" if delta >= 0 else ""
        stuck_str = f"{params['stuck'][0]}m@+{params['stuck'][1]:.1f}%" if params["stuck"] else "—"
        print(
            f"#{rank:<4}{total:+,}원{'':<3}{w}/{l:<6}"
            f"{params['sl']:<7.1f}+{params['ta']:<6.1f}{params['pb']:<7.2f}{params['hold']:<7}{stuck_str:<25}{sign}{delta:,}원"
        )

    print()
    print("=" * 110)
    print("Section G. Top 5 룰의 5/4 vs 5/6 분리 손익")
    print("=" * 110)
    print(f"{'룰':<55}{'5/4':<14}{'5/6':<14}{'합계':<14}{'편향':<10}")
    base_total_d, _, _, base_per = evaluate_rule(pairs, cache, baseline, by_date=True)
    print(
        f"{'베이스 (SL=-3.0 TA=+5.0 PB=1.0 HOLD=30)':<55}"
        f"{base_per.get('2026-05-04', 0):+,}원{'':<2}"
        f"{base_per.get('2026-05-06', 0):+,}원{'':<2}"
        f"{base_total_d:+,}원"
    )
    for total, w, l, params in results[:5]:
        _, _, _, per = evaluate_rule(pairs, cache, params, by_date=True)
        d54 = per.get("2026-05-04", 0)
        d56 = per.get("2026-05-06", 0)
        # 한 날에 몰빵된 결과인지 체크
        bias = "균형" if (d54 > 0 and d56 > -50000) or (d56 > 0 and d54 > -50000) else "편향"
        stuck_str = f"{params['stuck'][0]}m@+{params['stuck'][1]:.1f}%" if params["stuck"] else "—"
        label = f"SL={params['sl']:.1f} TA=+{params['ta']:.1f} PB={params['pb']:.2f} HOLD={params['hold']} stuck={stuck_str}"
        print(
            f"{label[:55]:<55}"
            f"{d54:+,}원{'':<2}"
            f"{d56:+,}원{'':<2}"
            f"{total:+,}원{'':<2}"
            f"{bias}"
        )

    print(f"\n바닥 5:")
    for rank, (total, w, l, params) in enumerate(results[-5:], len(results) - 4):
        delta = total - base_total
        sign = "+" if delta >= 0 else ""
        stuck_str = f"{params['stuck'][0]}m@+{params['stuck'][1]:.1f}%" if params["stuck"] else "—"
        print(
            f"#{rank:<4}{total:+,}원{'':<3}{w}/{l:<6}"
            f"{params['sl']:<7.1f}+{params['ta']:<6.1f}{params['pb']:<7.2f}{params['hold']:<7}{stuck_str:<25}{sign}{delta:,}원"
        )


if __name__ == "__main__":
    main()
