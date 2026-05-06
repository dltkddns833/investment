"""
Q 정채원 트레일링 활성선 +3% what-if 백테스트.

5/4·5/6 실제 매매 14건의 30분 보유 구간을 KIS 1분봉으로 재구성하여
트레일링 활성선만 +5% → +3%로 바꿨을 때의 청산 결과를 비교한다.

룰 (변경분):
  STOP_LOSS_PCT = -3.0
  TRAILING_ACTIVATE_PCT = 3.0   # ← +5에서 +3으로 변경
  TRAILING_PULLBACK_PCT = 1.0
  HOLD_DURATION_MIN = 30
"""
import sys
from pathlib import Path
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "core"))

from broker_client import KISClient
from supabase_client import supabase

KST = ZoneInfo("Asia/Seoul")

STOP_LOSS_PCT = -3.0
TRAILING_ACTIVATE_PCT = 3.0
TRAILING_PULLBACK_PCT = 1.0
HOLD_DURATION_MIN = 30
FEE_RATE = 0.00015  # 매수/매도 수수료
TAX_RATE = 0.0018   # 증권거래세 (매도 시)
SLIPPAGE = 0.0005   # 슬리피지 0.05%


def fetch_buy_sell_pairs(dates):
    """investor_id='Q'의 buy/sell 쌍을 시간순으로 추출"""
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


def parse_kst(ts):
    # Supabase가 마이크로초 자릿수가 변동(5자리 등)이라 정규화
    s = ts.replace("Z", "+00:00")
    if "." in s and "+" in s:
        head, rest = s.split(".", 1)
        frac, tz = rest.split("+", 1)
        frac = (frac + "000000")[:6]
        s = f"{head}.{frac}+{tz}"
    return datetime.fromisoformat(s).astimezone(KST)


def simulate_exit(client, pair):
    """매수 시각부터 30분 동안 1분봉으로 새 룰 청산을 시뮬.

    Returns:
        {
          'exit_pct': float (% 손익률),
          'exit_reason': str,
          'exit_time': 'HHMM',
          'exit_price': int,
          'peak_pct': float,
        }
    """
    buy_dt = parse_kst(pair["buy"]["executed_at"])
    avg_price = pair["buy"]["price"]
    date_str = buy_dt.strftime("%Y%m%d")
    end_dt = buy_dt + timedelta(minutes=HOLD_DURATION_MIN)

    # KIS 분봉: hour_str 이전 최대 120건. 14:00 hour_str로 호출하면
    # 09:00~14:00 분봉을 다 받을 수 있도록 30분 윈도우의 끝+1분 시각으로 호출.
    # 하지만 한 번에 120건 한도라, 안전하게 buy_dt 직후 + 60분 시각을 hour_str로
    # 사용해 1분 단위 60개 정도를 받는다.
    hour_str = (end_dt + timedelta(minutes=2)).strftime("%H%M%S")
    bars = client.get_minute_chart(pair["buy"]["ticker"], date_str, hour_str=hour_str)

    # 시간 오름차순 정렬, 30분 윈도우 내만 선별 (buy_dt 이후 ~ end_dt 까지)
    bars_in_window = []
    for b in bars:
        # b['time'] = 'HHMMSS'
        t = b["time"].zfill(6)
        bar_dt = buy_dt.replace(
            hour=int(t[0:2]), minute=int(t[2:4]), second=0, microsecond=0
        )
        if bar_dt < buy_dt or bar_dt > end_dt:
            continue
        bars_in_window.append((bar_dt, b))
    bars_in_window.sort(key=lambda x: x[0])

    peak_pct = 0.0
    trailing_active = False
    last_close = avg_price
    last_dt = buy_dt

    for bar_dt, b in bars_in_window:
        # 1분봉 내 최고가/최저가도 고려 (peak는 high, 손절/풀백은 low/close 모두 검토)
        high = b["high"]
        low = b["low"]
        close = b["close"]
        last_close = close
        last_dt = bar_dt

        high_pct = (high / avg_price - 1) * 100
        low_pct = (low / avg_price - 1) * 100
        close_pct = (close / avg_price - 1) * 100

        # 손절: 분 내 저가가 -3% 이하면 즉시 청산 (체결가 -3% 가정)
        if low_pct <= STOP_LOSS_PCT:
            exit_price = int(avg_price * (1 + STOP_LOSS_PCT / 100))
            return {
                "exit_pct": STOP_LOSS_PCT,
                "exit_reason": "손절",
                "exit_time": bar_dt.strftime("%H%M"),
                "exit_price": exit_price,
                "peak_pct": peak_pct,
            }

        # peak 갱신 (분 내 고가 기준)
        if high_pct > peak_pct:
            peak_pct = high_pct

        # 트레일링 활성화 (분 내 고가가 +3% 이상)
        if not trailing_active and peak_pct >= TRAILING_ACTIVATE_PCT:
            trailing_active = True

        # 트레일링 청산: 활성화 후 분 내 저가가 peak - 1%p 이하면 청산
        # 활성화된 같은 분에서는 청산하지 않고, 다음 분부터 체크
        if trailing_active and peak_pct >= TRAILING_ACTIVATE_PCT:
            trigger_pct = peak_pct - TRAILING_PULLBACK_PCT
            # 분봉 종가 기준으로 평가 (실제 q_monitor가 30초마다 현재가 체크)
            if close_pct <= trigger_pct and high_pct < TRAILING_ACTIVATE_PCT + 0.01:
                # 같은 봉에서 처음 활성화된 경우는 봉 마감 시점 close 기준으로 판정
                pass
            if close_pct <= trigger_pct:
                # close에서 트리거된 것으로 가정
                return {
                    "exit_pct": close_pct,
                    "exit_reason": "트레일링",
                    "exit_time": bar_dt.strftime("%H%M"),
                    "exit_price": close,
                    "peak_pct": peak_pct,
                }

    # 30분 강제 청산
    final_pct = (last_close / avg_price - 1) * 100
    return {
        "exit_pct": final_pct,
        "exit_reason": "강제청산",
        "exit_time": last_dt.strftime("%H%M"),
        "exit_price": last_close,
        "peak_pct": peak_pct,
    }


def calc_profit(buy_price, sell_price, shares):
    """수수료/세금/슬리피지 반영 손익 (q_monitor와 동일 가정)"""
    # 슬리피지: 매수 +0.05%, 매도 -0.05%
    buy_eff = buy_price * (1 + SLIPPAGE)
    sell_eff = sell_price * (1 - SLIPPAGE)
    buy_amount = int(buy_eff * shares)
    sell_amount = int(sell_eff * shares)
    buy_fee = int(buy_amount * FEE_RATE)
    sell_fee = int(sell_amount * (FEE_RATE + TAX_RATE))
    profit = sell_amount - buy_amount - buy_fee - sell_fee
    return profit, buy_fee + sell_fee


def main():
    dates = ["2026-05-04", "2026-05-06"]
    pairs = fetch_buy_sell_pairs(dates)
    client = KISClient()

    print(f"{'='*120}")
    print(f"Q 정채원 트레일링 활성선 +3% what-if 백테스트")
    print(f"{'='*120}")
    print(f"{'#':<3}{'날짜':<6}{'시각':<7}{'종목':<14}{'매수':<10}"
          f"{'실제 매도':<14}{'실제 손익률':<14}"
          f"{'시뮬 매도':<14}{'시뮬 손익률':<14}{'시뮬 사유':<14}{'peak':<10}{'차이':<10}")
    print(f"{'-'*120}")

    by_date = {d: {"actual": 0, "sim": 0, "n": 0} for d in dates}

    for i, p in enumerate(pairs, 1):
        buy = p["buy"]
        sell = p["sell"]
        actual_pct = (sell["price"] / buy["price"] - 1) * 100
        actual_profit = sell["profit"]

        sim = simulate_exit(client, p)
        sim_profit, _ = calc_profit(buy["price"], sim["exit_price"], buy["shares"])

        date = buy["date"]
        by_date[date]["actual"] += actual_profit
        by_date[date]["sim"] += sim_profit
        by_date[date]["n"] += 1

        diff = sim_profit - actual_profit
        time_str = parse_kst(buy["executed_at"]).strftime("%H:%M")

        print(
            f"{i:<3}{date[5:]:<6}{time_str:<7}{buy['name'][:6]:<14}"
            f"{buy['price']:>8,}원  "
            f"{sell['price']:>8,}원   "
            f"{actual_pct:+6.2f}%      "
            f"{sim['exit_price']:>8,}원   "
            f"{sim['exit_pct']:+6.2f}%      "
            f"{sim['exit_reason']:<10}"
            f"{sim['peak_pct']:+5.2f}%   "
            f"{diff:+,}원"
        )

    print(f"{'-'*120}")
    for d in dates:
        b = by_date[d]
        delta = b["sim"] - b["actual"]
        sign = "+" if delta >= 0 else ""
        print(
            f"{d}: 실제 {b['actual']:+,}원 / 시뮬 {b['sim']:+,}원 "
            f"(차이 {sign}{delta:,}원, {b['n']}건)"
        )

    total_actual = sum(b["actual"] for b in by_date.values())
    total_sim = sum(b["sim"] for b in by_date.values())
    delta = total_sim - total_actual
    sign = "+" if delta >= 0 else ""
    print(
        f"\n합계: 실제 {total_actual:+,}원 / 시뮬 {total_sim:+,}원 "
        f"(차이 {sign}{delta:,}원)"
    )

    # 보수적 시나리오: 실제 -3% 손절났는데 시뮬은 트레일링 익절로 잡힌 케이스
    # (1분봉 low가 -3%를 못 찍은 노이즈)는 실제대로 손절 가정.
    print(f"\n[보수적 시나리오: 실제 -3% 손절난 사이클은 손절 그대로 가정]")
    cons_actual = total_actual
    cons_sim = 0
    for p in pairs:
        buy = p["buy"]
        sell = p["sell"]
        actual_pct = (sell["price"] / buy["price"] - 1) * 100
        actual_profit = sell["profit"]
        sim = simulate_exit(client, p)
        sim_profit, _ = calc_profit(buy["price"], sim["exit_price"], buy["shares"])
        # 실제 손절(-3% 이하) 케이스는 시뮬 결과와 무관하게 실제 손익 사용
        if actual_pct <= STOP_LOSS_PCT + 0.1:  # -2.9% 이하면 실제 손절로 간주
            cons_sim += actual_profit
        else:
            cons_sim += sim_profit
    cons_delta = cons_sim - cons_actual
    sign = "+" if cons_delta >= 0 else ""
    print(
        f"보수적 합계: 실제 {cons_actual:+,}원 / 시뮬 {cons_sim:+,}원 "
        f"(차이 {sign}{cons_delta:,}원)"
    )


if __name__ == "__main__":
    main()
