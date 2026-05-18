#!/bin/bash
# 오전 8:45 — Q 정채원 급락 반등 스캘핑 v2.1 (이슈 #60, 2026-05-18 백지 재설계 + OOS 검증)
# 09:30~14:00 진입 윈도우 / HOLDING 모니터링 14:30까지
# 풀: KOSPI200 ∪ stock_universe (199종목, scripts/q_v2/cache/universe.csv 유동성 통과)
# 시그널: 직전 5분 ≤ -2.5% AND 현재 분봉 양봉 ≥ +0.3% (매분 풀 전 종목 1분봉 직접 평가, 6 worker)
# 청산: +2.5% 익절 / -1.5% 손절 / 30분 시간청산
# 동시 보유 1종목 + 당일 재매수 금지 + 일일 8회 한도 + 3연패 60분 쿨다운 + bear 진입 차단
# 백테스트: 학습 13건 61.5% +9.02% / 검증 14건 57.1% +7.97% (통합 27건 ≈+17% MDD -4.67%)

export HOME="/Users/isang-un"
export PATH="/Users/isang-un/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
PROJECT_DIR="/Users/isang-un/Desktop/personal/investment"
LOG_DIR="$PROJECT_DIR/logs/q_monitor"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/q_monitor_$DATE.log"

mkdir -p "$LOG_DIR"

# 주말 체크 (토=6, 일=7)
DAY_OF_WEEK=$(date +%u)
if [ "$DAY_OF_WEEK" -ge 6 ]; then
    echo "주말 - 스킵" >> "$LOG_FILE"
    exit 0
fi

echo "=== Q 정채원 모니터링 시작: $(date) ===" >> "$LOG_FILE"

cd "$PROJECT_DIR/scripts/core"
/usr/bin/python3 q_monitor.py >> "$LOG_FILE" 2>&1

echo "=== Q 정채원 모니터링 종료: $(date) (코드: $?) ===" >> "$LOG_FILE"
