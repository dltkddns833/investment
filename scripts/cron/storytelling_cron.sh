#!/bin/bash
# 오후 3:35 — 스토리텔링 (Part B: 종가 반영 + 코멘터리 + 투자자 일기)
# 장마감(15:30) 후 5분 대기 후 실행

export HOME="/Users/isang-un"
export PATH="/Users/isang-un/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
PROJECT_DIR="/Users/isang-un/Desktop/personal/investment"
LOG_DIR="$PROJECT_DIR/logs/storytelling"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/storytelling_$DATE.log"

mkdir -p "$LOG_DIR"

# 파일 디스크립터 제한 해제
ulimit -n 2147483646

# 주말 체크 (토=6, 일=7)
DAY_OF_WEEK=$(date +%u)
if [ "$DAY_OF_WEEK" -ge 6 ]; then
    echo "주말 - 스킵" >> "$LOG_FILE"
    exit 0
fi

echo "=== 스토리텔링 시작: $(date) ===" >> "$LOG_FILE"

cd "$PROJECT_DIR"
/Users/isang-un/.local/bin/claude -p "오늘($DATE) 스토리텔링 해줘." \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
    --dangerously-skip-permissions >> "$LOG_FILE" 2>&1

STORY_EXIT=$?
echo "스토리텔링 종료코드: $STORY_EXIT" >> "$LOG_FILE"
echo "=== 스토리텔링 종료: $(date) ===" >> "$LOG_FILE"

if [ $STORY_EXIT -eq 0 ]; then
    osascript -e 'display notification "스토리텔링이 완료되었습니다." with title "모의 투자" sound name "Glass"'
else
    osascript -e 'display notification "스토리텔링이 실패했습니다!" with title "모의 투자" sound name "Basso"'
    cd "$PROJECT_DIR/scripts/notifications"
    /usr/bin/python3 send_telegram.py "[스토리텔링] $DATE 실행 실패 (코드: $STORY_EXIT)"
fi
