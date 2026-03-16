# 모의 투자 시뮬레이션

> **대시보드**: https://investment-phi-six.vercel.app/

11명의 가상 투자자(A~K)가 서로 다른 **투자 성향**과 **리밸런싱 빈도**로 한국 주식 및 ETF에 투자하여 성과를 비교하는 시뮬레이션. 각 투자자는 전용 데이터 모듈과 AI 에이전트를 통해 독립적으로 배분을 결정한다.

## 투자자

| ID | 이름 | 전략 | 투자성향 | 리밸런싱 | 종목수 | 데이터 모듈 |
|----|------|------|----------|----------|--------|-------------|
| A | 강돌진 | 공격적 모멘텀 | 공격투자형 | 매일 | 5~8 | `momentum_data.py` |
| B | 김균형 | 균형 분산 | 위험중립형 | 매주 | 10~15 | `sector_analysis.py` |
| C | 이든든 | 보수적 우량주 | 안정추구형 | 매월 | 5~10 | `quality_metrics.py` + `dividend_data.py` |
| D | 장반대 | 역발상 투자 | 적극투자형 | 3일마다 | 5~8 | `momentum_data.py` (역으로 해석) |
| E | 정기준 | 동일 가중 벤치마크 | 위험중립형 | 격주 | 전 종목 | 없음 (기계적 1/N) |
| F | 윤순환 | 섹터 로테이션 | 적극투자형 | 격주 | 6~9 | `sector_analysis.py` |
| G | 문여론 | 뉴스 감성 기반 | 공격투자형 | 매일 | 5~10 | 없음 (뉴스 텍스트 기반) |
| H | 박기술 | 기술적 분석 | 공격투자형 | 매일 | 5~8 | `technical_indicators.py` |
| I | 최배당 | 배당 투자 | 안정형 | 분기별 | 5~10 | `dividend_data.py` |
| J | 한따라 | 스마트머니 추종 | 위험중립형 | 매주 | 5~8 | `institutional_flow.py` (pykrx + 네이버 fallback) |
| K | 로로캅 | 글로벌 자산배분 (ETF 전용) | 안정추구형 | 매월 | 4~8 | `asset_allocation.py` |

- 시드머니: 각 500만원 (KRW)
- 시장: KOSPI + KOSDAQ — 일반주 35종목 + ETF 12종목 = **47종목** (yfinance 기반 실시간 시세)
- 데이터 저장소: Supabase (PostgreSQL)

## 시뮬레이션 흐름

```
[오전 — 시가 체결]
1. 뉴스 수집 → Supabase news 테이블
2. 투자자별 독립 분석/배분 결정 (11개 AI 에이전트 병렬)
   → 각 에이전트에 전용 데이터 모듈 결과 전달 → allocations 테이블
3. python3 scripts/core/simulate.py 실행
   → 시가(Open) 조회 → 리밸런싱 due 체크 → 매매 → daily_reports + portfolio_snapshots 저장

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
python3 scripts/core/market.py

# 시뮬레이션 실행
python3 scripts/core/simulate.py 2026-03-13

# 파이프라인 상태 확인
python3 scripts/core/daily_pipeline.py 2026-03-13

# 웹 대시보드 (Node 20+ 필요)
cd web && pnpm install && pnpm dev
```

## 프로젝트 구조

```
├── .env                              # Supabase 인증 (Python용)
├── scripts/
│   ├── core/                         # 시뮬레이션 핵심 엔진
│   │   ├── supabase_client.py          Supabase 클라이언트
│   │   ├── market.py                   주가 조회 (yfinance, open/close)
│   │   ├── portfolio.py                매수/매도/평가/리밸런싱
│   │   ├── simulate.py                 시뮬레이션 오케스트레이터
│   │   └── daily_pipeline.py           뉴스/배분/스토리 저장 헬퍼
│   ├── modules/                      # 투자자별 데이터 분석 모듈
│   │   ├── momentum_data.py            모멘텀/수익률 (A, D용)
│   │   ├── sector_analysis.py          섹터별 성과 분석 (B, F용)
│   │   ├── quality_metrics.py          안정성/품질 지표 (C용)
│   │   ├── technical_indicators.py     RSI/MACD/볼린저 밴드 (H용)
│   │   ├── dividend_data.py            배당수익률 (I, C용)
│   │   ├── institutional_flow.py       외국인/기관 수급 (J용, pykrx→네이버 fallback + 캐시)
│   │   └── asset_allocation.py         ETF 카테고리별 수익률/변동성/추세 (K용)
│   ├── notifications/                # 알림 발송
│   │   └── send_telegram.py            텔레그램 알림
│   ├── reports/                      # 리포트 생성
│   │   ├── weekly_report.py            주간 성과 리포트
│   │   ├── monthly_report.py           월간 성과 리포트
│   │   └── quarterly_report.py         분기 성과 리포트
│   └── cron/                         # 자동 실행 셸 스크립트
│       └── daily_pipeline_cron.sh      09:05 통합 파이프라인 (launchd)
└── web/                              # Next.js 대시보드
    ├── .env.local                      Supabase 인증 (Next.js용)
    └── src/
        ├── app/api/
        │   ├── live-prices/            Yahoo Finance 실시간/종가 조회
        │   └── stock-chart/            Yahoo Finance 차트 데이터 (OHLC+거래량)
        └── lib/
            ├── supabase.ts             Supabase 클라이언트
            ├── data.ts                 데이터 조회 (async)
            └── live-prices.tsx         실시간 가격 Context (장중 LIVE / 장후 종가)
```

## 자동 실행 (현재 잠정 중단)

> 휴직 기간(~2026-04-13) 동안 수동 실행. 재개 시: `launchctl load ~/Library/LaunchAgents/com.investment.pipeline.plist`

macOS launchd로 평일 09:05에 통합 파이프라인 실행.

- **09:05**: 뉴스 수집 → 배분 결정 → 시뮬레이션(시가 체결) → 텔레그램 알림 (`scripts/cron/daily_pipeline_cron.sh`)
- **스토리텔링**: 장마감 후 별도 실행 (수동 또는 추후 16:00 cron 추가)
- 로그: `logs/pipeline_YYYY-MM-DD.log`

## 웹 대시보드

Next.js + TypeScript + Tailwind CSS + Recharts로 구성된 시각화 대시보드.

- **메인** (`/`): 투자자 순위, 마켓 코멘터리, 시장 현황(실시간/종가), 뉴스
- **투자자 목록** (`/investors`): 전체 11명 카드 그리드, 순위/수익률/투자성향 뱃지
- **투자자 상세** (`/investors/[id]`): 투자자 일기, 포트폴리오 차트, 자산 구성 변화(stacked area), 성과 기여도(종목별·섹터별), 목표 배분, 보유종목, 거래내역, 투자성향 뱃지, G는 감성 점수 추이
- **리포트** (`/reports`): 달력 히트맵, 월간 수익률
- **종목 분석** (`/stocks`): 섹터 히트맵, 섹터 비중, 국내주식(35개)/ETF(12개) 분리 목록
- **종목 상세** (`/stocks/[ticker]`): 가격 차트, ETF 구성정보(섹터 비중·구성 종목), 보유 투자자, 거래내역
- **분석** (`/analysis`): 성과 지표(샤프비율·MDD·변동성·알파·승률), 수익률 상관관계 히트맵, 포지션 겹침률, 종목 인기도, 성과 기여도 분석
- **대결** (`/versus`): 추천 대결, 자유 선택, 주간 MVP/꼴찌, 연승 기록
- **대결 상세** (`/versus/[matchup]`): 1:1 자산 비교, 일별 수익률 차이, 포지션 비교
- **리그** (`/league`): 월간 시즌제 승점 순위(1위=11점~11위=1점), 누적 승점 추이 차트, 시즌 아카이브
- **뉴스 아카이브** (`/news`): 날짜별 뉴스 카드, 섹터별 아이콘
- **이야기 아카이브** (`/stories`): 과거 데일리 코멘터리 & 투자자 일기 (캘린더 탐색)

장중(09:00~15:30)에는 LIVE 뱃지와 함께 3분 간격 자동 폴링, 장마감 후에는 종가 뱃지와 함께 10분 간격으로 Yahoo Finance에서 가격을 조회하여 포트폴리오를 재계산한다. 순위 변동 시 하이라이트 애니메이션이 표시된다.
