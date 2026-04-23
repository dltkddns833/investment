#!/bin/bash
# 오후 1:30 — 메타 매니저 (실전 투자)
# 15명 시뮬레이션 데이터 종합 → 실전 배분 → 텔레그램 승인 → KIS 체결

export HOME="/Users/isang-un"
export PATH="/Users/isang-un/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
PROJECT_DIR="/Users/isang-un/Desktop/personal/investment"
LOG_DIR="$PROJECT_DIR/logs/meta"
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

# Claude CLI로 메타 매니저 실행 (A 강돌진 추종 모드)
cd "$PROJECT_DIR"
/Users/isang-un/.local/bin/claude -p "오늘($DATE) 메타 매니저를 **A 강돌진 추종 모드**로 실행해줘.

모드 설명: config.risk_limits.meta_manager.follow_investor_id='A'. 매일 A 투자자의 당일 allocation을 그대로 실전 target_allocation으로 사용한다. Claude의 독립 판단 없이 A의 판단을 복사.

단계:
1. python3 scripts/core/meta_manager.py 실행 → status 확인
2. status별 처리:
   - emergency_triggered → execute_emergency_orders(orders=result['emergency_orders'], decision_type=result['decision_type'], regime=<market_regimes 최신값>)
   - awaiting_decision → allocations 테이블에서 오늘 날짜 + investor='강돌진' 레코드를 조회해 allocation/rationale을 꺼낸 뒤 execute_allocation(target_allocation=<A의 allocation>, rationale='[A 강돌진 추종] ' + <A의 rationale>, selected_strategies={'A': 1.0}, regime=<DB 레짐>) 호출
   - skip/killed/daily_loss_halt/emergency_liquidated → 텔레그램으로 상태 알리고 종료
3. 최종 결과를 텔레그램으로 정리해서 보고" \
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
