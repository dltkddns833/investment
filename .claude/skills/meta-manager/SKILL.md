---
name: meta-manager
description: "실전 투자 메타 매니저 실행. 15명 시뮬레이션 데이터 종합 → 실전 배분 결정 → KIS API 체결. 사용자가 '메타 매니저', '메타매니저', '실전 투자', '메타 실행', '메타 돌려' 등을 언급하면 반드시 이 스킬을 사용한다."
---

# 메타 매니저 (실전 투자)

15명 시뮬레이션 데이터를 종합 분석하여 실전 매매를 결정하는 AI 시스템.
핵심 원칙: 코스피 대비 초과 수익 (알파 양수 유지).

## 사전 조건

- 장 운영시간(09:00~15:20) 내 실행
- 프로젝트 루트: `/Users/isang-un/Desktop/personal/investment`

## 실행 절차

### Step 1: 실행 + 상태 확인

```bash
cd /Users/isang-un/Desktop/personal/investment && python3 scripts/core/meta_manager.py
```

status에 따라 분기:

| status | 의미 | 다음 단계 |
|--------|------|-----------|
| `awaiting_decision` | 정규 리밸런싱 (격주 수요일) | → Step 2 |
| `emergency_triggered` | 긴급 손절/급락방어 | → Step 3b |
| `skip` | 비리밸런싱일 + 긴급 없음 | → 종료 |
| `killed` | 킬스위치 활성화 | → 텔레그램 알림 후 종료 |
| `daily_loss_halt` | 일일 손실 -3% | → 텔레그램 알림 후 종료 |
| `emergency_liquidated` | 누적 손실 -10% 전량 청산 | → 텔레그램 알림 후 종료 |

### Step 2: 배분 결정 (Claude AI 판단, 격주 수요일만)

분석 리포트를 바탕으로 최적 종목 배분을 결정한다.

#### 사전 연구 참고
리밸런싱 전 GitHub 이슈에서 사전 토론/연구가 진행된 경우, 해당 이슈의 최종 합의안을 반드시 참고한다.

#### 종목 선택 원칙
- **합의 종목 우선**: 15명 중 4명+ 보유 종목(E 제외)을 후보 풀로 사용
- **기존 보유 종목 유지 편향**: 명확한 매도 사유 없이 교체 금지
- **신규 종목 진입 제한**: 1회 리밸런싱에 최대 2개까지
- **포지션 부분 조정**: 전량 교체 대신 비중 조절(±5~10%p) 우선

#### 비중 결정 기준
- 스코어카드 추천 전략의 보유 비중 참고 (dataWarning 있으면 추천 미부여)
- 리스크 플래그 많은 전략의 종목은 비중 축소/회피
- 최근 5일 모멘텀 상위 전략 종목 우선

#### 자동 보호 장치 (코드가 강제)
- 레짐별 투자 비중: bear 30%, neutral 60%, bull 90%
- stock_universe 외 종목 자동 제거
- 안정화 기간: 허용 종목 외 자동 제거 + 현금 최소 40%
- 보유기간 제약: "보유필수" 종목 매도 자동 스킵

#### 결과 형식
- `target_allocation`: `{"005930.KS": 0.15, ...}` (합계 ≤ 0.95, 현금 5%+)
- `rationale`: 근거 텍스트
- `selected_strategies`: 참고한 전략 `{"H": 0.4, "O": 0.3, ...}`

### Step 3a: execute_allocation() 호출 (정규 리밸런싱)

```bash
cd /Users/isang-un/Desktop/personal/investment/scripts/core && python3 -c "
from meta_manager import MetaManager
mm = MetaManager(date_str='YYYY-MM-DD')
result = mm.execute_allocation(
    target_allocation={...},
    rationale='...',
    selected_strategies={...},
    regime='neutral',
)
print(result)
"
```

내부 처리: 요일 가드 → 레짐 DB 강제 → 배분 검증 → 레짐별 비중 강제 → 보유기간/안정화/회전율 필터 → 주문 생성 → 텔레그램 승인(5분 타임아웃) → KIS API 체결 → meta_decisions + real_portfolio 저장.

### Step 3b: execute_emergency_orders() 호출 (긴급 손절/급락방어)

Step 1에서 `emergency_triggered` 반환 시:

```bash
cd /Users/isang-un/Desktop/personal/investment/scripts/core && python3 -c "
from meta_manager import MetaManager
mm = MetaManager(date_str='YYYY-MM-DD')
result = mm.execute_emergency_orders(
    orders=[...],
    decision_type='emergency_stop_loss',
    regime='neutral',
)
print(result)
"
```

긴급 매도만 실행 (신규 매수 없음). 텔레그램 승인 필수.

### 결과 확인

최종 상태를 텔레그램으로 알린다.

## 보호 장치 요약

- 리밸런싱: 격주 수요일
- 손절: 레짐별 차등 (bear -7%, neutral -8%, bull -10%)
- 급락 방어: +20% 이상 도달 후 고점 대비 -15% 이탈 시 긴급 매도
- 최소 보유기간: 5영업일
- 회전율 한도: 총자산 25%
- 일일 손실 -3% → 거래 중단
- 누적 손실 -10% → 전량 청산
- 킬스위치: config에서 관리
- 장 운영시간 외 주문 차단
- 텔레그램 승인 필수 (5분 타임아웃 시 취소)
