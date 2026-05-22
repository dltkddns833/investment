#!/bin/bash
# 오전 9:10 — C 옵션 한국 매크로 추종 (이상운 트랙, 시즌2)
# BetterWealth FA 18판+25판 합집합 비중을 매일 체크 → 변경 시 KIS 자동 매매
# 가드: 휴장일 스킵 (Python 측), 장 운영시간 09:10~14:30, 킬스위치

export HOME="/Users/isang-un"
export PATH="/Users/isang-un/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
PROJECT_DIR="/Users/isang-un/Desktop/personal/investment"
LOG_DIR="$PROJECT_DIR/logs/portfolio_follow"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/portfolio_follow_$DATE.log"

mkdir -p "$LOG_DIR"

# 주말 체크 (토=6, 일=7) — 공휴일은 Python 측에서 holidays.KR로 판별
DAY_OF_WEEK=$(date +%u)
if [ "$DAY_OF_WEEK" -ge 6 ]; then
    echo "주말 - 스킵" >> "$LOG_FILE"
    exit 0
fi

echo "=== C 옵션 추종 cron 시작: $(date) ===" >> "$LOG_FILE"

cd "$PROJECT_DIR/scripts/core"
/usr/bin/python3 portfolio_follow.py >> "$LOG_FILE" 2>&1

echo "=== C 옵션 추종 cron 종료: $(date) (코드: $?) ===" >> "$LOG_FILE"
