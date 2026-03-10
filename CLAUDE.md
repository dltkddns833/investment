# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

한국 주식 모의 투자 시뮬레이션. 3명의 투자자(A/B/C)가 동일한 종목 풀(20개)에서 **서로 다른 투자 성향과 리밸런싱 빈도**로 투자하여 성과를 비교하는 실험.

- 시드머니: 각 500만원 (KRW)
- 시장: KOSPI + KOSDAQ (yfinance 기반 실시간 시세)
- 투자자 A: 공격적 모멘텀 / 매일 리밸런싱 / 5~8종목 집중
- 투자자 B: 균형 분산 / 매주 리밸런싱 / 10~15종목 분산
- 투자자 C: 보수적 우량주 / 매월 리밸런싱 / 5~10종목

## Session Start Check

대화 시작 시 Supabase `daily_reports` 테이블에서 오늘 날짜 레코드 존재 여부를 확인한다.
- 레코드가 **없으면**: 사용자에게 "오늘 시뮬레이션이 아직 진행되지 않았습니다. '시뮬레이션 진행해줘'를 입력해주세요." 라고 안내한다.
- 레코드가 **있으면**: 별도 안내 없이 사용자의 요청을 기다린다.
- 주말/공휴일(한국 증시 휴장일)은 체크하지 않는다.

## Commands

```bash
# 시세 조회
python3 scripts/market.py

# 시뮬레이션 실행 (배분이 미리 Supabase에 저장되어 있어야 함)
python3 scripts/simulate.py              # 오늘 날짜
python3 scripts/simulate.py 2026-03-10   # 특정 날짜

# 파이프라인 상태 확인
python3 scripts/daily_pipeline.py 2026-03-10

# 기존 JSON → Supabase 마이그레이션 (1회성)
python3 scripts/migrate_to_supabase.py

# 의존성 설치
pip3 install -r requirements.txt
```

## Architecture

**데이터 저장소: Supabase (PostgreSQL)**
- Python 스크립트가 데이터를 **쓰고**, Next.js가 데이터를 **읽는** 구조
- `scripts/supabase_client.py` — Python용 Supabase 클라이언트 (`.env`에서 인증 정보 로드)
- `web/src/lib/supabase.ts` — Next.js용 Supabase 클라이언트 (서버 컴포넌트 전용, `SUPABASE_SERVICE_ROLE_KEY` 사용)

**일일 파이프라인 흐름:**
```
뉴스 수집 (웹 검색)
  → Supabase news 테이블 저장
투자자별 독립 분석/배분 결정
  → Supabase allocations 테이블 저장
simulate.py 실행
  → market.py로 주가 조회
  → portfolio.py로 리밸런싱 due 체크 → 매도 먼저 → 매수
  → Supabase daily_reports 테이블에 리포트 저장
```

**핵심 분리 원칙:** `simulate.py`는 배분을 결정하지 않는다. Supabase에 사전 저장된 allocation만 실행한다. 뉴스 수집과 배분 판단은 Claude가 투자자 프로필 성향에 맞춰 수행.

**모듈 역할:**
- `scripts/supabase_client.py` — Supabase 클라이언트 초기화
- `scripts/market.py` — yfinance로 20종목 시세 조회 (config는 Supabase에서 로드)
- `scripts/portfolio.py` — 매수/매도/평가/리밸런싱 (Supabase 읽기/쓰기)
- `scripts/simulate.py` — 일일 시뮬레이션 오케스트레이터 (Supabase 읽기/쓰기)
- `scripts/daily_pipeline.py` — 뉴스 저장, 배분 저장, 상태 확인 (Supabase 쓰기)
- `scripts/migrate_to_supabase.py` — JSON → Supabase 1회성 마이그레이션

**Supabase 테이블 (8개):**

| 테이블 | PK | 주요 컬럼 | 설명 |
|--------|-----|-----------|------|
| `config` | id=1 (싱글턴) | simulation, investors, stock_universe, news_categories (모두 jsonb) | 시뮬레이션 설정 |
| `profiles` | id (A/B/C) | name, strategy, description, rebalance_frequency_days, risk_tolerance, analysis_criteria(jsonb), investment_style(jsonb) | 투자자 성향 |
| `portfolios` | investor_id | investor, strategy, initial_capital, cash, holdings(jsonb), last_rebalanced | 보유 현황 |
| `transactions` | serial id | investor_id(FK), date, type(buy/sell), ticker, name, shares, price, amount, profit | 거래 내역 |
| `rebalance_history` | serial id | investor_id(FK), date, trades(jsonb), total_asset_after | 리밸런싱 기록 |
| `allocations` | (investor_id, date) | investor, strategy, rationale, allocation(jsonb), allocation_sum, num_stocks | 일별 목표 배분 |
| `news` | date | collected_at, count, articles(jsonb) | 수집된 뉴스 |
| `daily_reports` | date | generated_at, market_prices(jsonb), rankings(jsonb), investor_details(jsonb) | 일간 리포트 |

- 테이블 생성 SQL: `supabase_schema.sql`
- 마이그레이션 스크립트: `scripts/migrate_to_supabase.py` (JSON → Supabase 1회성, 완료됨)

**환경변수:**
- `/.env` — Python용 (`SUPABASE_URL`, `SUPABASE_KEY`)
- `/web/.env.local` — Next.js용 (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- 테이블 생성 SQL: `supabase_schema.sql`

## Key Conventions

- 모든 금액은 KRW 정수 (소수점 없음)
- allocation 비율 합계는 반드시 1.0
- 리밸런싱: 매도 먼저 → 매수 순서 (현금 확보 후 매수)
- 코스피 티커: `.KS` 접미사, 코스닥: `.KQ` 접미사
- stock_universe 종목 변경은 반드시 사용자 확인 후 진행 (임의 선정 금지)
- 포트폴리오의 `last_rebalanced: null`이면 첫 리밸런싱 무조건 실행

## Web Dashboard

`web/` — Next.js (TypeScript + Tailwind) 대시보드. 시뮬레이션 결과를 시각적으로 확인.
- 메인(`/`): 투자자 순위, 시장 현황, 뉴스
- 투자자 상세(`/investors/[id]`): 포트폴리오 차트, 보유종목, 거래내역
- Supabase에서 데이터를 읽어 서버 컴포넌트에서 렌더링 (DB 직접 쿼리)
- Node 20+ 필요, 상세 내용은 `web/CLAUDE.md` 참조

```bash
cd web && pnpm dev    # 개발 서버 (localhost:4000)
cd web && pnpm build  # 빌드
```

## Key Preferences

- stock_universe 종목 변경은 반드시 사용자 확인 후 진행 (임의 선정 금지)
- 현재 20종목 → 자금 증가 시 50~100개로 확대 예정
- 뉴스 파일에는 원문만 저장, 투자 판단은 투자자별 독립 수행

## Daily Pipeline Trigger

사용자가 "오늘 시뮬레이션 진행해줘" 요청 시 아래 순서대로 실행한다.

### Step 1: 뉴스 수집
- WebSearch로 한국 증시 관련 뉴스 검색 (경제, 산업, 기업, 정책, 글로벌)
- 10~15건 수집 후 `daily_pipeline.py`의 `save_news()`로 Supabase에 저장

### Step 2: 투자자별 배분 결정 (3개 독립 AI 에이전트 병렬 실행)
**반드시 3개의 서브에이전트(Agent tool)를 동시에 병렬 실행**하여 각 투자자의 배분을 독립적으로 결정한다.
- 각 에이전트는 자기 투자자의 프로필 + 뉴스만 전달받고, 다른 투자자의 판단을 알 수 없음
- 에이전트에게 전달할 정보: 투자자 프로필 JSON 내용, 뉴스 내용, stock_universe 목록, 현재 포트폴리오 상태
- 에이전트는 분석 후 `save_allocation()`으로 Supabase에 저장
- allocation 합계 = 1.0, stock_universe 종목만 사용
- A (공격적 모멘텀): 모멘텀/테마주 집중, 5~8종목
- B (균형 분산): 섹터별 골고루, 10~15종목
- C (보수적 우량주): 대형주/배당주 위주, 5~10종목

### Step 3: 시뮬레이션 실행
- `python3 scripts/simulate.py {date}` 실행
- 주가 조회 → 리밸런싱 due 체크 → 매매 실행 → 리포트 생성

### Step 4: 결과 요약
- 각 투자자별 총자산, 수익률, 오늘 거래 내역 보고

### 주의사항
- 리밸런싱 due가 아닌 투자자는 allocation이 있어도 매매 스킵
- B는 7일마다, C는 30일마다만 실행
- 첫날은 `last_rebalanced: null`이므로 모두 실행
