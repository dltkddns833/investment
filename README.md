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
[오전 — 시가 체결]
1. 뉴스 수집 → Supabase news 테이블
2. 투자자별 독립 분석/배분 결정 (7개 AI 에이전트 병렬) → allocations 테이블
3. python3 scripts/simulate.py 실행
   → 시가(Open) 조회 → 리밸런싱 due 체크 → 매매 → daily_reports 저장

[장마감 후 — 스토리텔링]
4. 코멘터리 & 투자자 일기 생성 → daily_stories 테이블

[대시보드]
5. 16:00 이후 접속 시 Yahoo Finance 종가 자동 조회 → 포트폴리오 실시간 재계산
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
├── .env                          # Supabase 인증 (Python용)
├── scripts/
│   ├── supabase_client.py        # Supabase 클라이언트
│   ├── market.py                 # 주가 조회 (yfinance, open/close 지원)
│   ├── portfolio.py              # 매수/매도/평가/리밸런싱
│   ├── simulate.py               # 시뮬레이션 오케스트레이터 (시가 체결)
│   ├── daily_pipeline.py         # 뉴스/배분/스토리 저장 헬퍼
│   ├── daily_pipeline_cron.sh    # 09:05 통합 파이프라인 (launchd)
│   ├── send_telegram.py          # 텔레그램 알림 발송
│   └── weekly_report.py          # 주간 성과 리포트
└── web/                          # Next.js 대시보드
    ├── .env.local                # Supabase 인증 (Next.js용)
    └── src/
        ├── app/api/
        │   ├── live-prices/      # Yahoo Finance 실시간/종가 조회
        │   └── stock-chart/      # Yahoo Finance 차트 데이터 (OHLC+거래량)
        └── lib/
            ├── supabase.ts       # Supabase 클라이언트
            ├── data.ts           # 데이터 조회 (async)
            └── live-prices.tsx   # 실시간 가격 Context (장중 LIVE / 장후 종가)
```

## 자동 실행 (현재 잠정 중단)

> 휴직 기간(~2026-04-13) 동안 수동 실행. 재개 시: `launchctl load ~/Library/LaunchAgents/com.investment.pipeline.plist`

macOS launchd로 평일 09:05에 통합 파이프라인 실행.

- **09:05**: 뉴스 수집 → 배분 결정 → 시뮬레이션(시가 체결) → 텔레그램 알림 (`daily_pipeline_cron.sh`)
- **스토리텔링**: 장마감 후 별도 실행 (수동 또는 추후 16:00 cron 추가)
- 로그: `logs/pipeline_YYYY-MM-DD.log`

## 웹 대시보드

Next.js + TypeScript + Tailwind CSS + Recharts로 구성된 시각화 대시보드.

- **메인** (`/`): 투자자 순위, 마켓 코멘터리, 시장 현황(실시간/종가), 뉴스
- **투자자 상세** (`/investors/[id]`): 투자자 일기, 포트폴리오 차트, 목표 배분, 보유종목, 거래내역
- **리포트** (`/reports`): 달력 히트맵, 월간 수익률
- **종목 분석** (`/stocks`): 섹터 히트맵(실시간), 섹터 비중, 종목 리스트(실시간)
- **종목 상세** (`/stocks/[ticker]`): Yahoo Finance 실시간 차트(1M/3M/6M/1Y), 보유 투자자(실시간), 거래내역

장중(09:00~15:30)에는 LIVE 뱃지, 장마감 후에는 종가 뱃지와 함께 Yahoo Finance에서 가격을 자동 조회하여 포트폴리오를 재계산한다.
