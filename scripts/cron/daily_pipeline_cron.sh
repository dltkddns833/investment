#!/bin/bash
# 오전 9:05 — 통합 파이프라인 (뉴스 수집 + 배분 + 시뮬레이션 + 스토리텔링 + 주간 리포트 + 텔레그램)
# 시가 확정 대기 5분 후 실행

export HOME="/Users/isang-un"
export PATH="/Users/isang-un/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
PROJECT_DIR="/Users/isang-un/Desktop/personal/investment"
LOG_DIR="$PROJECT_DIR/logs/pipeline"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/pipeline_$DATE.log"

mkdir -p "$LOG_DIR"

# 파일 디스크립터 제한 해제
ulimit -n 2147483646

# 주말 체크 (토=6, 일=7)
DAY_OF_WEEK=$(date +%u)
if [ "$DAY_OF_WEEK" -ge 6 ]; then
    echo "주말 - 스킵" >> "$LOG_FILE"
    exit 0
fi

# Claude CLI 버전 체크 — 업데이트 시 전체 디스크 접근 권한 갱신 필요
CLAUDE_VERSION_FILE="$PROJECT_DIR/.claude_version"
CURRENT_VERSION=$(/Users/isang-un/.local/bin/claude --version 2>/dev/null | head -1)
if [ -f "$CLAUDE_VERSION_FILE" ]; then
    PREV_VERSION=$(cat "$CLAUDE_VERSION_FILE")
    if [ "$CURRENT_VERSION" != "$PREV_VERSION" ]; then
        cd "$PROJECT_DIR/scripts/notifications"
        /usr/bin/python3 send_telegram.py "⚠️ Claude CLI 업데이트 감지
이전: $PREV_VERSION → 현재: $CURRENT_VERSION
[전체 디스크 접근 권한]에서 새 버전을 허용해주세요."
        echo "$CURRENT_VERSION" > "$CLAUDE_VERSION_FILE"
    fi
else
    echo "$CURRENT_VERSION" > "$CLAUDE_VERSION_FILE"
fi

# 시작 알림
osascript -e 'display notification "파이프라인을 시작합니다..." with title "모의 투자"'

echo "=== 통합 파이프라인 시작: $(date) ===" >> "$LOG_FILE"

# Claude CLI로 전체 파이프라인 실행 (뉴스 수집 → 배분 → 시뮬레이션 → 스토리텔링)
cd "$PROJECT_DIR"
/Users/isang-un/.local/bin/claude -p "오늘($DATE) 시뮬레이션 진행해줘. 뉴스 수집(Step 1)부터 시작해." \
    --allowedTools "WebSearch,Agent,Bash,Read,Write,Edit,Glob,Grep" \
    --dangerously-skip-permissions >> "$LOG_FILE" 2>&1

SIM_EXIT=$?
echo "시뮬레이션 종료코드: $SIM_EXIT" >> "$LOG_FILE"

# 주간 리포트 (첫 영업일이 아니면 자동 스킵)
echo "--- 주간 리포트 체크 ---" >> "$LOG_FILE"
cd "$PROJECT_DIR/scripts/reports"
/usr/bin/python3 weekly_report.py >> "$LOG_FILE" 2>&1
echo "주간 리포트 종료코드: $?" >> "$LOG_FILE"

# 월간 리포트 (월 첫 영업일이 아니면 자동 스킵)
echo "--- 월간 리포트 체크 ---" >> "$LOG_FILE"
/usr/bin/python3 monthly_report.py >> "$LOG_FILE" 2>&1
echo "월간 리포트 종료코드: $?" >> "$LOG_FILE"

# 분기 리포트 (분기 첫 영업일이 아니면 자동 스킵)
echo "--- 분기 리포트 체크 ---" >> "$LOG_FILE"
/usr/bin/python3 quarterly_report.py >> "$LOG_FILE" 2>&1
echo "분기 리포트 종료코드: $?" >> "$LOG_FILE"

echo "=== 통합 파이프라인 종료: $(date) ===" >> "$LOG_FILE"

# 결과 판단
if [ $SIM_EXIT -eq 0 ]; then
    SUBJECT="[모의투자] $DATE 파이프라인 완료"
    osascript -e 'display notification "파이프라인이 완료되었습니다." with title "모의 투자" sound name "Glass"'
else
    SUBJECT="[모의투자] $DATE 파이프라인 실패 (코드: $SIM_EXIT)"
    osascript -e 'display notification "파이프라인이 실패했습니다!" with title "모의 투자" sound name "Basso"'
fi

# 로그 마지막 30줄을 본문으로
BODY=$(tail -30 "$LOG_FILE")

# 텔레그램 발송
cd "$PROJECT_DIR/scripts/notifications"
/usr/bin/python3 send_telegram.py "$SUBJECT
$BODY"
