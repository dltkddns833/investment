#!/bin/bash
# (레거시) 오전 9시 — 뉴스 수집 + 주간 리포트 (cron용)

export HOME="/Users/isang-un"
export PATH="/Users/isang-un/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
PROJECT_DIR="/Users/isang-un/Desktop/personal/investment"
LOG_DIR="$PROJECT_DIR/logs"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/morning_$DATE.log"

mkdir -p "$LOG_DIR"

# 파일 디스크립터 제한 해제
ulimit -n 2147483646

# 주말 체크 (토=6, 일=7)
DAY_OF_WEEK=$(date +%u)
if [ "$DAY_OF_WEEK" -ge 6 ]; then
    echo "주말 - 스킵" >> "$LOG_FILE"
    exit 0
fi

echo "=== 오전 파이프라인 시작: $(date) ===" >> "$LOG_FILE"

# 1. Claude CLI로 뉴스 수집
cd "$PROJECT_DIR"
/Users/isang-un/.local/bin/claude -p "오늘($DATE) 한국 증시 관련 뉴스를 수집해서 Supabase에 저장해줘. daily_pipeline.py의 save_news()를 사용해." \
    --allowedTools "WebSearch,Bash,Read,Write,Edit,Glob,Grep" \
    --dangerously-skip-permissions >> "$LOG_FILE" 2>&1

NEWS_EXIT=$?
echo "뉴스 수집 종료코드: $NEWS_EXIT" >> "$LOG_FILE"

# 2. 주간 리포트 (첫 영업일이 아니면 자동 스킵)
echo "--- 주간 리포트 체크 ---" >> "$LOG_FILE"
cd "$PROJECT_DIR/scripts/reports"
/usr/bin/python3 weekly_report.py >> "$LOG_FILE" 2>&1

WEEKLY_EXIT=$?
echo "주간 리포트 종료코드: $WEEKLY_EXIT" >> "$LOG_FILE"

echo "=== 오전 파이프라인 종료: $(date) ===" >> "$LOG_FILE"

# macOS 알림
if [ $NEWS_EXIT -eq 0 ]; then
    osascript -e 'display notification "뉴스 수집 완료" with title "모의 투자 (오전)"'
else
    osascript -e 'display notification "뉴스 수집 실패!" with title "모의 투자 (오전)" sound name "Basso"'
fi
