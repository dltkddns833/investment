#!/bin/bash
# 오전 8:45 — Q 정채원 7세션 스캘핑 모니터링
# 08:50 첫 세션 ATS 종목 선정 → 09:00/10:00/11:00/12:00/13:00/14:00/15:00 매수
# 매 세션마다 매수 후 2분 간격 5회 체크 → +5% 익절 / -3% 손절 / XX:10 강제 청산

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
