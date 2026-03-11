# 모의 투자 시뮬레이션

> **대시보드**: https://investment-phi-six.vercel.app/

7명의 가상 투자자(A~G)가 서로 다른 **투자 성향**과 **리밸런싱 빈도**로 한국 주식에 투자하여 성과를 비교하는 시뮬레이션.

## 투자자

| ID | 이름 | 전략 | 리밸런싱 | 종목수 | 성향 |
|----|------|------|----------|--------|------|
| A | 강돌진 | 공격적 모멘텀 | 매일 | 5~8 | 성장주/테마주 집중 |
| B | 김균형 | 균형 분산 | 매주 | 10~15 | 섹터 균등 분산 |
| C | 이든든 | 보수적 우량주 | 매월 | 5~10 | 대형주/배당주 위주 |
| D | 장반대 | 역발상 투자 | 3일마다 | 5~8 | 하락 종목 매수, 과열 종목 매도 |
| E | 정기준 | 동일 가중 벤치마크 | 격주 | 전 종목 | AI 판단 없이 균등 분배 (기준선) |
| F | 윤순환 | 섹터 로테이션 | 격주 | 6~9 | 유망 섹터 집중 후 전환 |
| G | 문여론 | 뉴스 감성 기반 | 매일 | 5~10 | 뉴스 긍정/부정 점수로만 판단 |

- 시드머니: 각 500만원 (KRW)
- 시장: KOSPI + KOSDAQ 20종목 (yfinance 기반 실시간 시세)
- 데이터 저장소: Supabase (PostgreSQL)

## 시뮬레이션 흐름

```
1. 뉴스 수집 → Supabase news 테이블
2. 투자자별 독립 분석/배분 결정 (7개 AI 에이전트 병렬) → allocations 테이블
3. python3 scripts/simulate.py 실행
   → 주가 조회 → 리밸런싱 due 체크 → 매매 → 리포트 생성
4. 결과 확인 → daily_reports 테이블 또는 웹 대시보드
```

## 설치 및 실행

```bash
# Python 의존성
pip3 install -r requirements.txt

# 환경변수 설정 (.env.example 참고)
cp .env.example .env
# SUPABASE_URL, SUPABASE_KEY 입력

# Supabase 테이블 생성 (SQL Editor에서 실행)
# supabase_schema.sql

# 시세 조회
python3 scripts/market.py

# 시뮬레이션 실행
python3 scripts/simulate.py 2026-03-11

# 웹 대시보드 (Node 20+ 필요)
cd web && pnpm install && pnpm dev
```

## 프로젝트 구조

```
├── .env                        # Supabase 인증 (Python용)
├── scripts/
│   ├── supabase_client.py      # Supabase 클라이언트
│   ├── market.py               # 주가 조회 (yfinance)
│   ├── portfolio.py            # 매수/매도/평가/리밸런싱
│   ├── simulate.py             # 시뮬레이션 오케스트레이터
│   ├── daily_pipeline.py       # 뉴스/배분 저장 헬퍼
│   ├── daily_cron.sh           # 오후 4시 시뮬레이션 cron
│   ├── morning_cron.sh         # 오전 9시 뉴스 수집 cron
│   ├── send_telegram.py        # 텔레그램 알림 발송
│   └── weekly_report.py        # 주간 성과 리포트
└── web/                        # Next.js 대시보드
    ├── .env.local              # Supabase 인증 (Next.js용)
    └── src/lib/
        ├── supabase.ts         # Supabase 클라이언트
        └── data.ts             # 데이터 조회 (async)
```

## 자동 실행

매일 2개의 cron이 자동 실행된다 (월~금).

- **오전 9시**: 뉴스 수집 + 주간 리포트 (`morning_cron.sh`)
- **오후 4시**: 시뮬레이션 실행 + 텔레그램 알림 (`daily_cron.sh`)
- 알림: macOS 알림 + 텔레그램
- 로그: `logs/morning_YYYY-MM-DD.log`, `logs/simulation_YYYY-MM-DD.log`

## 웹 대시보드

Next.js + TypeScript + Tailwind CSS + Recharts로 구성된 시각화 대시보드.

- **메인** (`/`): 투자자 순위, 시장 현황, 뉴스
- **투자자 상세** (`/investors/[id]`): 포트폴리오 차트, 보유종목, 거래내역
