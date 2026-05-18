"""scan_signal()만 단독 호출해서 시그널 스캔 흐름 검증 (매매 없음).

풀 199종목 1분봉 6개 동시 호출 → prev_5m + candle 평가 → 매치 종목 출력.
"""
from __future__ import annotations

import sys
import time
import warnings
from datetime import date
from pathlib import Path

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts" / "core"))

from broker_client import KISClient
from q_monitor import build_pool, scan_signal


def main():
    client = KISClient()
    pool = build_pool()
    pool_codes = [c for c, _ in pool]
    today_str = date.today().isoformat()
    print(f"풀 {len(pool_codes)}종목 (KOSPI200 ∪ stock_universe)")
    print(f"오늘: {today_str}")
    print()

    t0 = time.time()
    matches = scan_signal(client, pool_codes, today_str, exclude=set())
    elapsed = time.time() - t0
    print(f"스캔 완료: {elapsed:.1f}초, 매치 {len(matches)}개")
    print()

    if matches:
        print(f"{'순위':>3} {'코드':>10} {'prev_5m':>10} {'candle':>10} {'close':>12}")
        for i, m in enumerate(matches[:20], 1):
            print(f"{i:>3} {m['code']:>10} {m['prev_5m']:>+9.2f}% {m['candle']:>+9.2f}% {m['close']:>12,.0f}")
        if len(matches) > 20:
            print(f"  ... 외 {len(matches)-20}개")
    else:
        print("(매치 없음 — 시그널 조건 불충족)")


if __name__ == "__main__":
    main()
