#!/bin/bash
# 오전 9:15 — 개인 포트폴리오 추종 알림 (KR1GBRSERI99NKI1, 500만 시드)
# 회사 비중 변경 감지 시 텔레그램으로 매매 지시 발송 (자동 매매 없음)
# 가드: 휴장일 스킵 (Python 측)

export HOME="/Users/isang-un"
export PATH="/Users/isang-un/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
PROJECT_DIR="/Users/isang-un/Desktop/personal/investment"
LOG_DIR="$PROJECT_DIR/logs/portfolio_follow_personal"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/portfolio_follow_personal_$DATE.log"

mkdir -p "$LOG_DIR"

DAY_OF_WEEK=$(date +%u)
if [ "$DAY_OF_WEEK" -ge 6 ]; then
    echo "주말 - 스킵" >> "$LOG_FILE"
    exit 0
fi

echo "=== 개인 포트폴리오 추종 cron 시작: $(date) ===" >> "$LOG_FILE"

cd "$PROJECT_DIR/scripts/core"
/usr/bin/python3 portfolio_follow_personal.py >> "$LOG_FILE" 2>&1

echo "=== 개인 포트폴리오 추종 cron 종료: $(date) (코드: $?) ===" >> "$LOG_FILE"
