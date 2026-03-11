#!/bin/bash
# 일일 시뮬레이션 자동 실행 (cron용)

export PATH="/Users/isang-un/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
PROJECT_DIR="/Users/isang-un/Desktop/personal/investment"
LOG_DIR="$PROJECT_DIR/logs"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/simulation_$DATE.log"

mkdir -p "$LOG_DIR"

# 주말 체크 (토=6, 일=7)
DAY_OF_WEEK=$(date +%u)
if [ "$DAY_OF_WEEK" -ge 6 ]; then
    echo "주말 - 스킵" >> "$LOG_FILE"
    exit 0
fi

# 시작 알림
osascript -e 'display notification "시뮬레이션을 시작합니다..." with title "모의 투자"'

echo "=== 시뮬레이션 시작: $(date) ===" >> "$LOG_FILE"

# Claude CLI 실행 (뉴스는 오전 9시에 이미 수집됨)
cd "$PROJECT_DIR"
/Users/isang-un/.local/bin/claude -p "오늘 시뮬레이션 진행해줘. 뉴스는 이미 오전에 수집했으니 Step 1(뉴스 수집)은 건너뛰고 Step 2(배분 결정)부터 시작해." \
    --allowedTools "WebSearch,Agent,Bash,Read,Write,Edit,Glob,Grep" \
    -y >> "$LOG_FILE" 2>&1

EXIT_CODE=$?

echo "=== 시뮬레이션 종료: $(date), 종료코드: $EXIT_CODE ===" >> "$LOG_FILE"

# 결과 판단
if [ $EXIT_CODE -eq 0 ]; then
    SUBJECT="[모의투자] $DATE 시뮬레이션 완료"
    osascript -e 'display notification "시뮬레이션이 완료되었습니다." with title "모의 투자" sound name "Glass"'
else
    SUBJECT="[모의투자] $DATE 시뮬레이션 실패 (코드: $EXIT_CODE)"
    osascript -e 'display notification "시뮬레이션이 실패했습니다!" with title "모의 투자" sound name "Basso"'
fi

# 로그 마지막 30줄을 본문으로
BODY=$(tail -30 "$LOG_FILE")

# 텔레그램 발송
cd "$PROJECT_DIR/scripts"
/usr/bin/python3 send_telegram.py "$SUBJECT
$BODY"
