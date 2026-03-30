#!/bin/bash
# 오전 9:10 — O 정익절 장중 모니터링 (+5% 익절 / -3% 손절)
# 장마감(15:20)까지 10분 간격으로 현재가 체크

export HOME="/Users/isang-un"
export PATH="/Users/isang-un/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
PROJECT_DIR="/Users/isang-un/Desktop/personal/investment"
LOG_DIR="$PROJECT_DIR/logs/o_monitor"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/o_monitor_$DATE.log"

mkdir -p "$LOG_DIR"

# 주말 체크 (토=6, 일=7)
DAY_OF_WEEK=$(date +%u)
if [ "$DAY_OF_WEEK" -ge 6 ]; then
    echo "주말 - 스킵" >> "$LOG_FILE"
    exit 0
fi

echo "=== O 정익절 모니터링 시작: $(date) ===" >> "$LOG_FILE"

cd "$PROJECT_DIR/scripts/core"
/usr/bin/python3 o_monitor.py >> "$LOG_FILE" 2>&1

echo "=== O 정익절 모니터링 종료: $(date) (코드: $?) ===" >> "$LOG_FILE"
