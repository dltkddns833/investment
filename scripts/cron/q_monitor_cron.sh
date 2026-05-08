#!/bin/bash
# 오전 8:45 — Q 정채원 1분 상시 스캔 스캘핑 모니터링 v4 (2026-05-08~ 초단기 시그널 전환)
# 10:00~14:50 동안 1분 간격 KIS 등락률 순위 스캔
# 1차 narrow: 직전 분 대비 등락률 점프 ≥ +2%p (cold start: 등락률 ≥ +2% 전 종목)
# 2차 confirm: 1분봉 vol/5MA ≥ 3배 AND 1분 등락 ≥ +2%
# 가드: 등락률 ≤ +15%, 5MA vol ≥ 1,000주, 전일 종가 ≥ 2,000원
# 9시대 진입 차단 (분봉 부족), bear 레짐 진입 차단
# 매수 후 30분 모니터링 → 트레일링(+3%활성→-1%p이탈)/-3% 손절/매수+30분 강제 청산
# 동시 보유 1종목 + 당일 재매수 금지 + 일일 8회 한도 + 3연패 60분 쿨다운

export HOME="/Users/isang-un"
export PATH="/Users/isang-un/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
PROJECT_DIR="/Users/isang-un/Desktop/personal/investment"
LOG_DIR="$PROJECT_DIR/logs/q_monitor"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/q_monitor_$DATE.log"

mkdir -p "$LOG_DIR"

# 주말 체크 (토=6, 일=7)
DAY_OF_WEEK=$(date +%u)
if [ "$DAY_OF_WEEK" -ge 6 ]; then
    echo "주말 - 스킵" >> "$LOG_FILE"
    exit 0
fi

echo "=== Q 정채원 모니터링 시작: $(date) ===" >> "$LOG_FILE"

cd "$PROJECT_DIR/scripts/core"
/usr/bin/python3 q_monitor.py >> "$LOG_FILE" 2>&1

echo "=== Q 정채원 모니터링 종료: $(date) (코드: $?) ===" >> "$LOG_FILE"
