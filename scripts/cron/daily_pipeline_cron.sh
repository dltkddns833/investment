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
/Users/isang-un/.local/bin/claude -p "/simulate $DATE

[무인 자동 실행 모드] 사용자는 자리에 없다. 어떤 확인·승인도 절대 요청하지 말고 Step 1부터 Step 4까지 끝까지 자동 진행하라. 중간에 멈추면 후속 메타 매니저가 빈 데이터로 실행되어 실전 자본에 손해가 생긴다. 모호한 상황에서도 가장 안전한 기본값을 골라 진행을 멈추지 말 것." \
    --allowedTools "WebSearch,Agent,Bash,Read,Write,Edit,Glob,Grep" \
    --dangerously-skip-permissions >> "$LOG_FILE" 2>&1

SIM_EXIT=$?
echo "Claude CLI 종료코드: $SIM_EXIT" >> "$LOG_FILE"

# 산출물 검증 — Claude 종료코드 신뢰 금지, Supabase 실제 산출물로 시뮬 성공 판정
echo "--- 산출물 검증 ---" >> "$LOG_FILE"
ARTIFACT_CHECK=$(cd "$PROJECT_DIR/scripts/core" && /usr/bin/python3 -c "
import sys
try:
    from supabase_client import supabase
    dr = supabase.table('daily_reports').select('date').eq('date', '$DATE').execute().data
    ac = supabase.table('allocations').select('investor_id').eq('date', '$DATE').execute().data
    active_ids = {'A','C','D','E','F','G','H','I','J','K','M'}
    have_ids = {r['investor_id'] for r in ac}
    missing = active_ids - have_ids
    if not dr:
        print('FAIL: daily_reports 없음')
    elif missing:
        print(f'FAIL: allocations 부족 — 누락 {sorted(missing)}')
    else:
        print('OK')
except Exception as e:
    print(f'FAIL: 검증 예외 {e}')
" 2>&1)
echo "산출물 검증: $ARTIFACT_CHECK" >> "$LOG_FILE"

ARTIFACT_RESULT=$(echo "$ARTIFACT_CHECK" | tail -1)
if [[ "$ARTIFACT_RESULT" != "OK" ]]; then
    SIM_EXIT=99
    cd "$PROJECT_DIR/scripts/notifications"
    /usr/bin/python3 send_telegram.py "🚨 [모의투자] $DATE 시뮬레이션 산출물 검증 실패
$ARTIFACT_RESULT

→ 메타 매니저 자동 스킵. 수동 확인 필요."
fi

# 메타 매니저 — 2026-05-19 사용자 결정으로 비활성화 (전면 재정비 중)
# 재개 방법: 아래 블록의 주석 해제 + safety.py --kill-switch off
# if [ $SIM_EXIT -eq 0 ]; then
#     echo "--- 메타 매니저 실행 ---" >> "$LOG_FILE"
#     /bin/bash "$PROJECT_DIR/scripts/cron/meta_cron.sh"
#     echo "메타 매니저 종료코드: $?" >> "$LOG_FILE"
# else
#     echo "--- 시뮬레이션 실패로 메타 매니저 스킵 ---" >> "$LOG_FILE"
# fi
echo "--- 메타 매니저 비활성화 (2026-05-19~ 전면 재정비) ---" >> "$LOG_FILE"

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
