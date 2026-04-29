#!/bin/bash
# 오전 8:45 — Q 정채원 1분 상시 스캔 스캘핑 모니터링 (2026-04-29~ 거래량 폭증 매집 추종)
# 09:00~14:50 동안 1분 간격 KIS 등락률 순위 스캔
# 거래량 폭증(직전 15분 ≥3배, 2배 fallback) + 등락률 ≥+5% + 전일 종가 ≥ 2,000원
# 9시대(09:00~09:59)는 분봉 비교 불가 → 당일 누적 거래량 1위 fallback
# 매수 후 30분 모니터링 → +4% 익절 / -3% 손절 / 미달성 시 매수+30분 강제 청산
# 동시 보유 1종목 + 당일 재매수 금지

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
