#!/bin/bash
# 오후 1:30 — 메타 매니저 (실전 투자)
# 15명 시뮬레이션 데이터 종합 → 실전 배분 → 텔레그램 승인 → KIS 체결

export HOME="/Users/isang-un"
export PATH="/Users/isang-un/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
PROJECT_DIR="/Users/isang-un/Desktop/personal/investment"
LOG_DIR="$PROJECT_DIR/logs"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/meta_$DATE.log"

mkdir -p "$LOG_DIR"

# 주말 체크 (토=6, 일=7)
DAY_OF_WEEK=$(date +%u)
if [ "$DAY_OF_WEEK" -ge 6 ]; then
    echo "주말 - 스킵" >> "$LOG_FILE"
    exit 0
fi

echo "=== 메타 매니저 시작: $(date) ===" >> "$LOG_FILE"

cd "$PROJECT_DIR/scripts/core"
/usr/bin/python3 meta_manager.py >> "$LOG_FILE" 2>&1

META_EXIT=$?
echo "=== 메타 매니저 종료: $(date) (코드: $META_EXIT) ===" >> "$LOG_FILE"

if [ $META_EXIT -ne 0 ]; then
    cd "$PROJECT_DIR/scripts/notifications"
    /usr/bin/python3 send_telegram.py "[메타매니저] $DATE 실행 실패 (코드: $META_EXIT)"
fi
