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

# 파일 디스크립터 제한 해제
ulimit -n 2147483646

# 주말 체크 (토=6, 일=7)
DAY_OF_WEEK=$(date +%u)
if [ "$DAY_OF_WEEK" -ge 6 ]; then
    echo "주말 - 스킵" >> "$LOG_FILE"
    exit 0
fi

echo "=== 메타 매니저 시작: $(date) ===" >> "$LOG_FILE"

# Claude CLI로 메타 매니저 실행 (주 1회 정규 리밸런싱 + 매일 긴급 손절/익절 체크)
cd "$PROJECT_DIR"
/Users/isang-un/.local/bin/claude -p "오늘($DATE) 메타 매니저 실행해줘. python3 scripts/core/meta_manager.py 로 실행한 뒤, status에 따라 처리해줘:
- awaiting_decision → 배분 결정 후 execute_allocation() 실행
- emergency_triggered → execute_emergency_orders() 실행
- skip/killed/daily_loss_halt → 텔레그램으로 상태 알리고 종료" \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
    --dangerously-skip-permissions >> "$LOG_FILE" 2>&1

META_EXIT=$?
echo "=== 메타 매니저 종료: $(date) (코드: $META_EXIT) ===" >> "$LOG_FILE"

if [ $META_EXIT -eq 0 ]; then
    osascript -e 'display notification "메타 매니저가 완료되었습니다." with title "실전 투자" sound name "Glass"'
else
    osascript -e 'display notification "메타 매니저가 실패했습니다!" with title "실전 투자" sound name "Basso"'
    cd "$PROJECT_DIR/scripts/notifications"
    /usr/bin/python3 send_telegram.py "[메타매니저] $DATE 실행 실패 (코드: $META_EXIT)"
fi
