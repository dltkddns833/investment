# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

한국 주식 모의 투자 시뮬레이션. 11명의 투자자(A~K)가 동일한 종목 풀(47개, 일반주 35개 + ETF 12개)에서 **서로 다른 투자 성향과 리밸런싱 빈도**로 투자하여 성과를 비교하는 실험.

- 시드머니: 각 500만원 (KRW)
- 시장: KOSPI + KOSDAQ (yfinance 기반 실시간 시세)
- A 강돌진: 공격적 모멘텀 / 매일 리밸런싱 / 5~8종목 집중
- B 김균형: 균형 분산 / 매주 리밸런싱 / 10~15종목 분산
- C 이든든: 보수적 우량주 / 매월 리밸런싱 / 5~10종목
- D 장반대: 역발상 투자 / 3일마다 리밸런싱 / 5~8종목 (A와 정반대)
- E 정기준: 동일 가중 벤치마크 / 격주 리밸런싱 / 전 종목 균등 (기준선)
- F 윤순환: 섹터 로테이션 / 격주 리밸런싱 / 2~3섹터 집중
- G 문여론: 뉴스 감성 기반 / 매일 리밸런싱 / 5~10종목 (감성 점수만 사용)
- H 박기술: 기술적 분석 / 매일 리밸런싱 / 5~8종목 (RSI, MACD, 볼린저 밴드 기반)
- I 최배당: 배당 투자 / 분기별 리밸런싱 / 5~10종목 (배당수익률 중심)
- J 한따라: 스마트머니 추종 / 매주 리밸런싱 / 5~8종목 (외국인/기관 수급 추종)
- K 로로캅: 글로벌 자산배분 로보어드바이저 / 매월 리밸런싱 / ETF 전용 4~8종목 (지수·섹터·해외·채권·배당 ETF 조합)

## Session Start Check

대화 시작 시 Supabase `daily_reports` 테이블에서 오늘 날짜 레코드 존재 여부를 확인한다.
- 레코드가 **없으면**: 사용자에게 "오늘 시뮬레이션이 아직 진행되지 않았습니다. '시뮬레이션 진행해줘'를 입력해주세요." 라고 안내한다.
- 레코드가 **있으면**: 별도 안내 없이 사용자의 요청을 기다린다.
- 주말/공휴일(한국 증시 휴장일)은 체크하지 않는다.

## Commands

```bash
# 시세 조회
python3 scripts/core/market.py

# 시뮬레이션 실행 (배분이 미리 Supabase에 저장되어 있어야 함)
python3 scripts/core/simulate.py              # 오늘 날짜 (시가 체결)
python3 scripts/core/simulate.py 2026-03-10   # 특정 날짜 (시가 체결)
python3 scripts/core/simulate.py 2026-03-10 --close  # 종가 반영 (장마감 후)

# 파이프라인 상태 확인
python3 scripts/core/daily_pipeline.py 2026-03-10

# 테스트 실행
python3 -m pytest tests/ -v

# 의존성 설치
pip3 install -r requirements.txt
```

## 자동 실행 (launchd) — 잠정 중단 (2026-03-13~)

> **현재 상태: 수동 실행** — 휴직 기간(~2026-04-13) 동안 launchd 스케줄 해제. 사용자가 직접 Claude CLI로 시뮬레이션 실행.
> 재개 시: `launchctl load ~/Library/LaunchAgents/com.investment.pipeline.plist`

macOS launchd로 스케줄 실행 (OAuth 세션 유지를 위해 cron 대신 사용).

### 오전 9:05 — 시뮬레이션 (시가 체결)
- plist: `~/Library/LaunchAgents/com.investment.pipeline.plist`
- `scripts/cron/daily_pipeline_cron.sh` — Claude CLI로 파이프라인 실행
  - 뉴스 수집 → 배분 결정 → 시뮬레이션(시가 체결) → 텔레그램 발송
- `scripts/reports/weekly_report.py` — 첫 영업일이면 지난주 성과 텔레그램 발송 (holidays 패키지로 공휴일 대응)
- `scripts/reports/monthly_report.py` — 월 첫 영업일이면 지난달 성과 텔레그램 발송 + Supabase 저장
- `scripts/reports/quarterly_report.py` — 분기 첫 영업일이면 지난 분기 성과 텔레그램 발송 + Supabase 저장
- 로그: `logs/pipeline_YYYY-MM-DD.log`
- 환경변수: `.env`에 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` 필요
- **스토리텔링은 장마감 후 별도 실행** (cron 자동화 시 16:00 스케줄 추가 필요)

### 재개 시 필요 설정: macOS 전체 디스크 접근 권한
launchd 프로세스가 `~/Desktop` 하위 프로젝트에 접근할 때 macOS 권한 팝업이 뜰 수 있다.
**설정 > 개인정보 보호 및 보안 > 전체 디스크 접근 권한**에서 아래 항목 허용:
- `/bin/bash`
- `/Users/isang-un/.local/bin/claude` (Claude CLI)
- `/usr/bin/python3`

```bash
# 설정 화면 바로 열기
open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
```

## Architecture

**데이터 저장소: Supabase (PostgreSQL)**
- Python 스크립트가 데이터를 **쓰고**, Next.js가 데이터를 **읽는** 구조
- `scripts/core/supabase_client.py` — Python용 Supabase 클라이언트 (`.env`에서 인증 정보 로드)
- `web/src/lib/supabase.ts` — Next.js용 Supabase 클라이언트 (서버 컴포넌트 전용, `SUPABASE_SERVICE_ROLE_KEY` 사용)

**일일 파이프라인 흐름:**
```
[오전] 뉴스 수집 → 배분 결정 → 시뮬레이션 (시가 체결)
  → market.py (price_type="open") → portfolio.py → daily_reports + portfolio_snapshots 저장

[장마감 후] 종가 반영 → 스토리텔링 (코멘터리 + 투자자 일기)
  → simulate.py --close (종가로 daily_reports + portfolio_snapshots 갱신)
  → 종가 반영된 daily_reports 기반 콘텐츠 생성 → daily_stories 저장

[대시보드] 장중에는 Yahoo Finance 실시간 시세로 포트폴리오 재계산 (useLiveRankings)
  → 장마감 후에는 종가 반영된 daily_reports 데이터 표시
```

**핵심 분리 원칙:** `simulate.py`는 배분을 결정하지 않는다. Supabase에 사전 저장된 allocation만 실행한다. 뉴스 수집과 배분 판단은 Claude가 투자자 프로필 성향에 맞춰 수행.

**디렉토리 구조:**

```
scripts/
  core/              # 시뮬레이션 핵심 엔진
    supabase_client.py   Supabase 클라이언트 초기화
    market.py            yfinance 시세 조회 (open/close)
    portfolio.py         매수/매도/평가/리밸런싱
    simulate.py          일일 시뮬레이션 오케스트레이터 + 종가 업데이트
    daily_pipeline.py    뉴스/배분/스토리 저장 헬퍼
  modules/           # 투자자별 데이터 분석 모듈
    momentum_data.py       모멘텀/수익률 (A, D용)
    sector_analysis.py     섹터별 성과 (B, F용)
    quality_metrics.py     안정성/품질 지표 (C용)
    technical_indicators.py  RSI/MACD/볼린저 밴드 (H용)
    dividend_data.py       배당수익률 (I, C용)
    institutional_flow.py  외국인/기관 수급 (J용, pykrx→네이버 fallback + Supabase 캐시)
    asset_allocation.py    ETF 카테고리별 수익률/변동성/추세 (K용)
  notifications/     # 알림 발송
    send_telegram.py     텔레그램 알림
  reports/           # 리포트 생성
    weekly_report.py     주간 성과 리포트
    monthly_report.py    월간 성과 리포트 (월 첫 영업일 자동 생성)
    quarterly_report.py  분기 성과 리포트 (분기 첫 영업일 자동 생성)
  cron/              # 자동 실행 셸 스크립트
    daily_pipeline_cron.sh   09:05 통합 파이프라인
```

**Supabase 테이블 (12개):**

| 테이블 | PK | 주요 컬럼 | 설명 |
|--------|-----|-----------|------|
| `config` | id=1 (싱글턴) | simulation, investors, stock_universe, news_categories (모두 jsonb) | 시뮬레이션 설정 |
| `profiles` | id (A~K) | name, strategy, description, rebalance_frequency_days, risk_tolerance, risk_grade, analysis_criteria(jsonb), investment_style(jsonb) | 투자자 성향 |
| `portfolios` | investor_id | investor, strategy, initial_capital, cash, holdings(jsonb), last_rebalanced | 보유 현황 |
| `transactions` | serial id | investor_id(FK), date, type(buy/sell), ticker, name, shares, price, amount, profit | 거래 내역 |
| `rebalance_history` | serial id | investor_id(FK), date, trades(jsonb), total_asset_after | 리밸런싱 기록 |
| `allocations` | (investor_id, date) | investor, strategy, rationale, allocation(jsonb), allocation_sum, num_stocks, sentiment_scores(jsonb) | 일별 목표 배분 |
| `news` | date | collected_at, count, articles(jsonb) | 수집된 뉴스 |
| `daily_reports` | date | generated_at, market_prices(jsonb), rankings(jsonb), investor_details(jsonb) | 일간 리포트 |
| `daily_stories` | date | generated_at, commentary(text), diaries(jsonb) | 데일리 코멘터리 & 투자자 일기 |
| `portfolio_snapshots` | (investor_id, date) | holdings(jsonb), cash, total_asset, snapshot_at | 일별 포트폴리오 스냅샷 |
| `periodic_reports` | (period_type, period_label) | period_start, period_end, trading_days, rankings(jsonb), highlights(jsonb), league_standings(jsonb), summary | 월간/분기 리포트 + 리그 승점 |
| `institutional_flows` | (date, ticker) | foreign_net_5d, institutional_net_5d, foreign_net_today, institutional_net_today, foreign_ownership_pct, data_source | 외국인/기관 수급 캐시 |


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

**배포 URL**: https://investment-phi-six.vercel.app/

`web/` — Next.js (TypeScript + Tailwind) 대시보드. 시뮬레이션 결과를 시각적으로 확인. Vercel로 배포.
- 메인(`/`): 투자자 순위(전일 대비 변동 표시), 주간 MVP/연승, 시장 현황, 뉴스
- 투자자 목록(`/investors`): 전체 11명 카드 그리드, 순위/수익률 표시
- 투자자 상세(`/investors/[id]`): 카툰 아바타, 뱃지, 포트폴리오 차트, 자산 구성 변화(stacked area), 성과 기여도(종목별 바차트+섹터별 Treemap), 보유종목, 거래내역, 투자 방법론(대표인물/참고링크), G는 감성 점수 추이
- 리포트(`/reports`): 좌우 분할 마스터-디테일 레이아웃 (데스크탑: 왼쪽 달력+날짜목록 sticky | 오른쪽 코멘터리+투자자 현황+일기+뉴스, 모바일: 접기/펼치기 캘린더), 전일 대비 순위 변동 표시
- 종목 분석(`/stocks`): 섹터 히트맵, 섹터 비중, 국내주식(35개)/ETF(12개) 분리 목록
- 종목 상세(`/stocks/[ticker]`): 가격 차트, ETF면 구성정보(섹터 비중+구성 종목), 보유 투자자, 거래내역
- 분석(`/analysis`): 성과 지표(샤프/MDD/변동성/알파/승률), 수익률 상관관계 히트맵, 포지션 겹침률, 종목 인기도, 성과 기여도 분석(투자자별 섹터 기여도 비교)
- 대결(`/versus`): 추천 대결, 자유 선택, 주간 MVP/꼴찌, 연승 기록
- 대결 상세(`/versus/[matchup]`): 1:1 자산 비교, 일별 수익률 차이, 포지션 비교
- 리그(`/league`): 월간 시즌제 승점 순위(1위=11점~11위=1점), 누적 승점 추이 차트, 시즌 아카이브
- Supabase에서 데이터를 읽어 서버 컴포넌트에서 렌더링 (DB 직접 쿼리)
- Node 20+ 필요, 상세 내용은 `web/CLAUDE.md` 참조

```bash
cd web && pnpm dev    # 개발 서버 (localhost:4000)
cd web && pnpm build  # 빌드
```

## Key Preferences

- stock_universe 종목 변경은 반드시 사용자 확인 후 진행 (임의 선정 금지)
- 현재 47종목 (일반주 35개 + ETF 12개)
- 뉴스 파일에는 원문만 저장, 투자 판단은 투자자별 독립 수행

## Daily Pipeline Trigger

수동 실행 시 **시뮬레이션**과 **스토리텔링**은 별도 요청으로 나뉜다.
- 시뮬레이션: 장 시작 후 (시가 확정 후) — "시뮬레이션 진행해줘"
- 스토리텔링: 장마감 후 (종가 확정 후) — "스토리텔링 해줘"

### Part A: 시뮬레이션 ("시뮬레이션 진행해줘")

#### Step 1: 뉴스 수집
- WebSearch로 한국 증시 관련 뉴스 검색 (경제, 산업, 기업, 정책, 글로벌, 금융/보험, 통신/IT, 제약/바이오, 건설/부동산, 소비재/유통)
- 15~20건 수집 후 `scripts/core/daily_pipeline.py`의 `save_news()`로 Supabase에 저장
- 각 기사에 `url` 필드 포함: `{"title": ..., "summary": ..., "category": ..., "source": ..., "url": "https://..."}`

#### Step 2: 투자자별 배분 결정 (11개 독립 AI 에이전트 병렬 실행)
**반드시 11개의 서브에이전트(Agent tool)를 동시에 병렬 실행**하여 각 투자자의 배분을 독립적으로 결정한다.
- 각 에이전트는 자기 투자자의 프로필 + 뉴스만 전달받고, 다른 투자자의 판단을 알 수 없음
- 에이전트에게 전달할 정보: 투자자 프로필 JSON 내용, 뉴스 내용, stock_universe 목록, 현재 포트폴리오 상태
- A 에이전트에는 추가로 `scripts/modules/momentum_data.py`의 `get_momentum_data()` 결과를 전달 (모멘텀 상위 종목 집중)
- B 에이전트에는 추가로 `scripts/modules/sector_analysis.py`의 `get_sector_analysis()` 결과를 전달 (섹터 균형 참고)
- C 에이전트에는 추가로 `scripts/modules/quality_metrics.py`의 `get_quality_metrics()` + `scripts/modules/dividend_data.py`의 `get_dividend_data()` 결과를 전달 (안정성 + 배당)
- D 에이전트에는 추가로 `scripts/modules/momentum_data.py`의 `get_momentum_data()` 결과를 전달 (낙폭 과대 종목 집중)
- F 에이전트에는 추가로 `scripts/modules/sector_analysis.py`의 `get_sector_analysis()` 결과를 전달 (상위 섹터 집중)
- H 에이전트에는 추가로 `scripts/modules/technical_indicators.py`의 `get_technical_signals()` 결과를 전달
- I 에이전트에는 추가로 `scripts/modules/dividend_data.py`의 `get_dividend_data()` 결과를 전달
- J 에이전트에는 뉴스 중 외국인/기관 수급 관련 내용을 강조하여 전달
- K 에이전트에는 추가로 `scripts/modules/asset_allocation.py`의 `get_asset_allocation_data()` 결과를 전달 (ETF 카테고리별 수익률/변동성/추세 데이터)
- 에이전트는 분석 후 `save_allocation()`으로 Supabase에 저장
- rationale(배분 근거) 텍스트는 논점별로 줄바꿈(`\n`) 삽입하여 가독성 확보
- allocation 합계 = 1.0, stock_universe 종목만 사용
- A (공격적 모멘텀): 모멘텀/테마주 집중, 5~8종목
- B (균형 분산): 섹터별 골고루, 10~15종목
- C (보수적 우량주): 대형주/배당주 위주, 5~10종목
- D (역발상 투자): 최근 하락 종목 매수, 과열 종목 매도, 5~8종목
- E (동일 가중 벤치마크): 전 종목 동일 비중(1/N), AI 판단 없이 기계적 균등 분배
- F (섹터 로테이션): 유망 섹터 2~3개 선별 후 섹터 내 종목 집중, 섹터당 2~3종목
- G (뉴스 감성 기반): 뉴스 긍정/부정 감성 점수로만 비중 결정, 5~10종목. `save_allocation()` 호출 시 `sentiment_scores` 인자로 종목별 감성 점수 전달 (강한 긍정 +0.8~+1.0 / 긍정 +0.3~+0.7 / 중립 -0.2~+0.2 / 부정 -0.3~-0.7 / 강한 부정 -0.8~-1.0)
- H (기술적 분석): RSI 과매도 매수, 과매수 회피, MACD 골든크로스 우선, 5~8종목
- I (배당 투자): 배당수익률 상위 종목 집중, 재무 안정성 고려, 5~10종목
- J (스마트머니 추종): 뉴스에서 외국인/기관 순매수 동향 파악, 수급 양호 종목, 5~8종목
- K (글로벌 자산배분): **ETF 종목만 사용**, 지수/섹터/해외/채권/배당 ETF 카테고리별 비중 조절, 4~8종목. 주식ETF↔채권ETF 시소 원리 적용 (변동성 높을 때 채권 비중 확대)

#### Step 3: 시뮬레이션 실행 (시가 체결)
- `python3 scripts/core/simulate.py {date}` 실행
- 시가(Open) 기준 주가 조회 → 리밸런싱 due 체크 → 매매 실행 → 리포트 생성

#### Step 4: 결과 요약
- 각 투자자별 총자산, 수익률, 오늘 거래 내역 보고

### Part B: 스토리텔링 ("스토리텔링 해줘")

> **장마감(15:30) 이후 실행 권장** — 종가가 확정된 후 코멘터리를 작성해야 당일 시장 동향이 정확하게 반영된다.

#### Step 0: 종가 반영
- `python3 scripts/core/simulate.py {date} --close` 실행
- 종가(Close) 기준으로 market_prices, 포트폴리오 평가, 순위를 재계산하여 `daily_reports` 업데이트
- 매매 정보(trades_today, rebalanced_today)는 기존 시가 체결 데이터를 그대로 유지

종가 반영된 `daily_reports` 결과를 바탕으로 콘텐츠를 생성한다.

**데일리 코멘터리** (2~4문장)
- rankings, market_prices, investor_details를 분석하여 한국어 마켓 코멘터리 생성
- 오늘의 승자/패자, 주요 시장 동향, 눈에 띄는 거래
- 문단 구분이 필요한 곳에 줄바꿈(`\n`) 삽입하여 가독성 확보

**투자자 일기** (캐릭터별 어투, 각 2~3문장, 문장 간 줄바꿈 삽입)
- A 강돌진: 자신감 넘치는 공격적 ("확신한다", "올인했다")
- B 김균형: 차분하고 분석적 ("분산 효과가 나타나고 있다")
- C 이든든: 보수적이고 신중한 ("급할 것 없다", "안정적으로 유지")
- D 장반대: 역발상적 ("모두가 팔 때 샀다", "시장이 틀렸다")
- E 정기준: 기계적, 무감정 ("규칙대로 균등 분배", "감정 개입 없음")
- F 윤순환: 섹터 전문가 ("이번 주기에는 바이오가 유망하다")
- G 문여론: 뉴스/여론 민감 ("기사 톤이 긍정적이었다")
- H 박기술: 차트 분석가 ("차트가 말해주고 있다", "RSI가 과매도 구간이다")
- I 최배당: 배당 투자자 ("배당이 핵심이다", "꾸준한 현금흐름이 중요하다")
- J 한따라: 수급 추종자 ("외국인이 사는 이유가 있다", "기관 자금이 몰리고 있다")
- K 로로캅: 알고리즘식, 무감정 ("데이터가 말해준다", "최적 비중으로 재조정", "모델이 지시한 대로 실행")

**저장**: `scripts/core/daily_pipeline.py`의 `save_stories(date_str, commentary, diaries)` 호출
- `diaries`는 `{"강돌진": "일기 내용...", "김균형": "...", ..., "로로캅": "..."}` 형태 (투자자 이름 키)

### 주의사항
- 리밸런싱 due가 아닌 투자자는 allocation이 있어도 매매 스킵
- A/G/H는 매일, D는 3영업일마다, B/J는 7영업일마다, E/F는 14영업일마다, C/K는 30영업일마다, I는 90영업일마다만 실행 (holidays.KR 기반 휴장일 제외)
- 첫날은 `last_rebalanced: null`이므로 모두 실행
