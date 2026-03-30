# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

한국 주식 모의 투자 시뮬레이션. 15명의 투자자(A~O)가 동일한 종목 풀(100개, 일반주 85개 + ETF 15개)에서 **서로 다른 투자 성향과 리밸런싱 빈도**로 투자하여 성과를 비교하는 실험.

**궁극적 목표**: 시뮬레이션에서 검증된 최적 전략을 선별하여 **실전 자동 투자 시스템**으로 발전시키는 것. 현재는 전략 검증(R&D) 단계이며, 충분한 데이터 축적과 백테스트를 거친 후 증권사 API 연동을 통한 완전 자동 매매를 목표로 한다.

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
- L 신장모: 분할매도 전략 / 매일 체크 / 5~8종목 코스닥 성장주 (+15%/+30%/+50% 분할매도, -10% 손절)
- M 오판단: 마켓 타이밍 / 매일 체크 / 3~10종목 (KOSPI 레짐 판단, 강세장 90%+투자 / 약세장 70%+현금)
- N 전몰빵: 집중투자 / 매주 리밸런싱 / 2~3종목 올인 (모멘텀+펀더멘털+수급 3중 필터)
- O 정익절: 단기 스윙 수익실현 / 장중 10분 간격 모니터링 / 5~8종목 (총자산 +5% 전 종목 익절, 종목별 -3% 손절, 30분마다 모멘텀 이탈→급등 종목 교체, 일일 최대 3회)

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

# 백테스트 실행
python3 scripts/core/run_backtest.py --start 2025-03-01 --end 2026-03-01        # 전체
python3 scripts/core/run_backtest.py --start 2025-06-01 --end 2025-12-31 --investors A,B,E  # 특정 투자자
python3 scripts/core/run_backtest.py --start 2025-03-01 --end 2026-03-01 --cache  # 캐시 재사용
python3 scripts/core/run_backtest.py --start 2025-03-01 --end 2026-03-01 --no-save  # DB 저장 안 함

# 리스크 체크 (단독 실행)
python3 scripts/core/risk_manager.py              # 오늘 날짜
python3 scripts/core/risk_manager.py 2026-03-19   # 특정 날짜

# 과거 마켓 레짐 소급 계산
python3 scripts/core/backfill_regimes.py

# 메타 매니저 (실전 투자)
python3 scripts/core/meta_manager.py                    # 실행 (분석 → 배분 대기)
python3 scripts/core/meta_manager.py --dry-run           # 드라이런 (분석만, 주문 스킵)
python3 scripts/core/meta_manager.py --analyze-only      # 분석 결과만 출력
python3 scripts/core/meta_manager.py --date 2026-03-28   # 특정 날짜

# KIS API 테스트
python3 scripts/core/broker_client.py --test             # 삼성전자 현재가 조회
python3 scripts/core/broker_client.py --balance           # 예수금 조회
python3 scripts/core/broker_client.py --holdings          # 보유종목 조회

# 안전 장치
python3 scripts/core/safety.py --status                  # 킬스위치 상태
python3 scripts/core/safety.py --kill-switch on          # 킬스위치 활성화
python3 scripts/core/safety.py --kill-switch off         # 킬스위치 해제

# O 정익절 장중 모니터링
python3 scripts/core/o_monitor.py              # 실행 (09:10~15:20)
python3 scripts/core/o_monitor.py --dry-run     # 매도 없이 로그만

# 테스트 실행
python3 -m pytest tests/ -v

# 의존성 설치
pip3 install -r requirements.txt
```

## 자동 실행 (launchd)

macOS launchd로 스케줄 실행 (OAuth 세션 유지를 위해 cron 대신 사용).

### 오전 9:05 — 시뮬레이션 (시가 체결)
- plist: `~/Library/LaunchAgents/com.investment.pipeline.plist`
- `scripts/cron/daily_pipeline_cron.sh` — Claude CLI로 파이프라인 실행
  - 뉴스 수집 → 15명 배분 결정 → 시뮬레이션(시가 체결) → 텔레그램 발송
- `scripts/reports/weekly_report.py` — 첫 영업일이면 지난주 성과 텔레그램 발송 (holidays 패키지로 공휴일 대응)
- `scripts/reports/monthly_report.py` — 월 첫 영업일이면 지난달 성과 텔레그램 발송 + Supabase 저장
- `scripts/reports/quarterly_report.py` — 분기 첫 영업일이면 지난 분기 성과 텔레그램 발송 + Supabase 저장
- 로그: `logs/pipeline/pipeline_YYYY-MM-DD.log`
- 환경변수: `.env`에 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` 필요

### 오전 9:10 — O 정익절 장중 모니터링
- plist: `~/Library/LaunchAgents/com.investment.o-monitor.plist`
- `scripts/cron/o_monitor_cron.sh` → `scripts/core/o_monitor.py`
  - 10분 간격 체크: 총자산 +5% 전 종목 익절 / 종목별 -3% 해당 종목 손절
  - 30분 간격 능동 트레이딩(09:40~14:50): 모멘텀 이탈 종목 매도 → 급등 종목 편입 (일일 최대 3회)
  - 매매 발생 시 `daily_reports` + `portfolio_snapshots` 즉시 갱신 (대시보드 실시간 반영)
  - 장마감(15:20) 자동 종료
- 로그: `logs/o_monitor/o_monitor_YYYY-MM-DD.log`

### 오후 1:30 — 메타 매니저 (실전 투자)
- plist: `~/Library/LaunchAgents/com.investment.meta.plist`
- `scripts/cron/meta_cron.sh` → Claude CLI로 메타 매니저 실행
  - `meta_manager.py` 분석 → Claude AI 배분 결정 → `execute_allocation()` → 텔레그램 승인 → KIS 체결
- 로그: `logs/meta/meta_YYYY-MM-DD.log`

### 오후 3:35 — 스토리텔링 (종가 반영 + 코멘터리)
- plist: `~/Library/LaunchAgents/com.investment.storytelling.plist`
- `scripts/cron/storytelling_cron.sh` — Claude CLI로 스토리텔링 실행
  - 종가 반영 → 코멘터리 → 투자자 일기
- 로그: `logs/storytelling/storytelling_YYYY-MM-DD.log`

### launchd 관리 명령
```bash
# 전체 등록
launchctl load ~/Library/LaunchAgents/com.investment.pipeline.plist
launchctl load ~/Library/LaunchAgents/com.investment.o-monitor.plist
launchctl load ~/Library/LaunchAgents/com.investment.meta.plist
launchctl load ~/Library/LaunchAgents/com.investment.storytelling.plist

# 전체 해제
launchctl unload ~/Library/LaunchAgents/com.investment.pipeline.plist
launchctl unload ~/Library/LaunchAgents/com.investment.o-monitor.plist
launchctl unload ~/Library/LaunchAgents/com.investment.meta.plist
launchctl unload ~/Library/LaunchAgents/com.investment.storytelling.plist

# 상태 확인
launchctl list | grep com.investment
```

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

[대시보드 - 시뮬레이션] 장중에는 Yahoo Finance 실시간 시세로 포트폴리오 재계산 (useLiveRankings)
  → 장마감 후에는 종가 반영된 daily_reports 데이터 표시

[대시보드 - 실전 투자] KIS API로 실시간 보유종목/잔고 조회 (/api/kis-portfolio)
  → 장중 3분, 장마감 후 10분 간격 자동 폴링
```

**핵심 분리 원칙:** `simulate.py`는 배분을 결정하지 않는다. Supabase에 사전 저장된 allocation만 실행한다. 뉴스 수집과 배분 판단은 Claude가 투자자 프로필 성향에 맞춰 수행.

**디렉토리 구조:**

```
scripts/
  core/              # 시뮬레이션 핵심 엔진
    supabase_client.py   Supabase 클라이언트 초기화
    market.py            yfinance 시세 조회 (open/close)
    portfolio.py         매수/매도/평가/리밸런싱/분할매도(L전용)
    simulate.py          일일 시뮬레이션 오케스트레이터 + 종가 업데이트
    daily_pipeline.py    뉴스/배분/스토리 저장 헬퍼
    event_detector.py    이벤트 감지 & 텔레그램 알림 (시뮬레이션 후 자동 호출)
    risk_manager.py      리스크 관리 (포지션 제한 검증 + 리스크 이벤트 감지/알림)
    run_backtest.py      백테스트 CLI 진입점
    backfill_regimes.py  과거 마켓 레짐 소급 계산
    broker_client.py     한국투자증권 KIS API 클라이언트 (인증/잔고/주문)
    meta_manager.py      메타 매니저 — 15명 데이터 종합 → 실전 배분 결정
    scorecard.py         전략 스코어카드 엔진 (Python 포트, 6카테고리 가중평균)
    safety.py            실전 투자 안전 장치 (손실 한도/킬스위치/긴급청산)
    o_monitor.py         O 정익절 장중 실시간 모니터링 (총자산 +5%익절/-3%손절, 매매 시 daily_reports 즉시 갱신)
  backtest/          # 백테스트 엔진 (인메모리, DB 비접근)
    engine.py            InMemoryPortfolio + run_backtest() 루프
    strategies.py        15개 투자자별 결정론적 배분 함수
    price_cache.py       yfinance 일괄 다운로드 + pickle 캐시
    metrics.py           Sharpe/MDD/변동성/승률 계산
    historical_indicators.py  캐시된 DataFrame에서 모멘텀/RSI/MACD 등 계산
  modules/           # 투자자별 데이터 분석 모듈
    momentum_data.py       모멘텀/수익률 (A, D용)
    sector_analysis.py     섹터별 성과 (B, F용)
    quality_metrics.py     안정성/품질 지표 (C용)
    technical_indicators.py  RSI/MACD/볼린저 밴드 (H용)
    dividend_data.py       배당수익률 (I, C용)
    institutional_flow.py  외국인/기관 수급 (J용, pykrx→네이버 fallback + Supabase 캐시)
    asset_allocation.py    ETF 카테고리별 수익률/변동성/추세 (K용)
    market_regime.py       KOSPI 레짐 판단 — 이평선/거래량/변동성 (M용)
  notifications/     # 알림 발송
    send_telegram.py     텔레그램 알림 + 승인 플로우 (InlineKeyboard)
  reports/           # 리포트 생성
    weekly_report.py     주간 성과 리포트
    monthly_report.py    월간 성과 리포트 (월 첫 영업일 자동 생성)
    quarterly_report.py  분기 성과 리포트 (분기 첫 영업일 자동 생성)
  cron/              # 자동 실행 셸 스크립트
    daily_pipeline_cron.sh   09:05 통합 파이프라인
```

**Supabase 테이블 (18개):**

| 테이블 | PK | 주요 컬럼 | 설명 |
|--------|-----|-----------|------|
| `config` | id=1 (싱글턴) | simulation, investors, stock_universe, news_categories, trading_costs, risk_limits (모두 jsonb) | 시뮬레이션 설정 |
| `profiles` | id (A~K) | name, strategy, description, rebalance_frequency_days, risk_tolerance, risk_grade, analysis_criteria(jsonb), investment_style(jsonb) | 투자자 성향 |
| `portfolios` | investor_id | investor, strategy, initial_capital, cash, holdings(jsonb), last_rebalanced | 보유 현황 |
| `transactions` | serial id | investor_id(FK), date, type(buy/sell), ticker, name, shares, price, amount, profit, fee | 거래 내역 |
| `rebalance_history` | serial id | investor_id(FK), date, trades(jsonb), total_asset_after | 리밸런싱 기록 |
| `allocations` | (investor_id, date) | investor, strategy, rationale, allocation(jsonb), allocation_sum, num_stocks, sentiment_scores(jsonb) | 일별 목표 배분 |
| `news` | date | collected_at, count, articles(jsonb) | 수집된 뉴스 |
| `daily_reports` | date | generated_at, market_prices(jsonb), rankings(jsonb), investor_details(jsonb) | 일간 리포트 |
| `daily_stories` | date | generated_at, commentary(text), diaries(jsonb) | 데일리 코멘터리 & 투자자 일기 |
| `portfolio_snapshots` | (investor_id, date) | holdings(jsonb), cash, total_asset, snapshot_at | 일별 포트폴리오 스냅샷 |
| `periodic_reports` | (period_type, period_label) | period_start, period_end, trading_days, rankings(jsonb), highlights(jsonb), league_standings(jsonb), summary | 월간/분기 리포트 + 리그 승점 |
| `institutional_flows` | (date, ticker) | foreign_net_5d, institutional_net_5d, foreign_net_today, institutional_net_today, foreign_ownership_pct, data_source | 외국인/기관 수급 캐시 |
| `backtest_runs` | id (UUID) | start_date, end_date, trading_days, investors(jsonb), parameters(jsonb), summary(jsonb) | 백테스트 실행 메타데이터 |
| `backtest_snapshots` | (run_id, investor_id, date) | total_asset, cash, holdings(jsonb) | 백테스트 일별 스냅샷 |
| `risk_events` | serial id | date, investor_id, event_type, severity, details(jsonb), action_taken | 리스크 이벤트 기록 |
| `market_regimes` | date | regime(bull/neutral/bear), bull_score, kospi_price, ma20, ma60, ma20_slope, volume_ratio, volatility_20d, details(jsonb) | 일별 마켓 레짐 |
| `meta_decisions` | date | regime, morning_session(jsonb), selected_strategies(jsonb), rationale, target_allocation(jsonb), orders(jsonb), approved, executed, kospi_return_pct, meta_return_pct, alpha_pct | 메타 매니저 일별 의사결정 |
| `real_portfolio` | date | cash, holdings(jsonb), total_asset, daily_return_pct, cumulative_return_pct, kospi_cumulative_pct, alpha_cumulative_pct | 실전 포트폴리오 스냅샷 |


**환경변수:**
- `/.env` — Python용 (`SUPABASE_URL`, `SUPABASE_KEY`, `KIS_APP_KEY`, `KIS_APP_SECRET_KEY`, `KIS_ACCOUNT_NO`)
- `/web/.env.local` — Next.js용 (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- Vercel 환경변수 — 위 Next.js용 + `KIS_APP_KEY`, `KIS_APP_SECRET_KEY`, `KIS_ACCOUNT_NO` (실전 투자 실시간 조회용)

## Key Conventions

- **⚠️ KIS API 토큰: 1일 1회 발급 원칙. 유효기간 내 잦은 발급 시 이용 제한됨.**
  - Python `broker_client.py`만 토큰 발급 담당 (파일 `.kis_token.json` + Supabase `config.kis_token` 동시 저장)
  - Vercel `/api/kis-portfolio`는 Supabase에서 토큰을 **읽기만** 함 (절대 직접 발급 금지)
  - 토큰 유효기간: 발급 후 약 24시간. 만료 1시간 전부터 다음 `broker_client` 실행 시 자동 갱신
- 모든 금액은 KRW 정수 (소수점 없음)
- allocation 비율 합계는 ≤ 1.0 (M 오판단은 현금비중만큼 합계 < 1.0, 나머지는 1.0)
- 리밸런싱: 매도 먼저 → 매수 순서 (현금 확보 후 매수)
- 코스피 티커: `.KS` 접미사, 코스닥: `.KQ` 접미사
- ⚠️ yfinance에서 `.KQ`를 MUTUALFUND로 오인식하는 종목은 `.KS`로 등록: 엘앤에프(066970), 포스코DX(022100), 시프트업(462870), 더존비즈온(012510), 덴티움(145720), 코스맥스(192820), 씨에스윈드(112610)
- stock_universe 종목 변경은 반드시 사용자 확인 후 진행 (임의 선정 금지)
- 포트폴리오의 `last_rebalanced: null`이면 첫 리밸런싱 무조건 실행
- 거래 비용: 매수 수수료 0.015% + 매도 수수료 0.015% + 증권거래세 0.18% + 슬리피지 0.05% (config.trading_costs에서 조정 가능)
- 슬리피지는 체결가 조정 방식 (매수 +0.05%, 매도 -0.05%), 수수료/세금은 현금에서 별도 차감
- 리스크 관리: allocation 저장 시 포지션 제한 자동 검증 (`risk_manager.validate_allocation()`), 시뮬레이션 후 리스크 이벤트 감지 (`risk_manager.check_risk_limits()`)
- 리스크 제한 기본값: 단일종목 30%, 섹터 50%, 최소현금 5%, 일일손실 -3%, 누적손실 -10%, MDD -8%, 연속손실 5일, 종목급변 ±10%
- 리스크 예외: N(종목/섹터/현금 무제한), M(현금 무제한), K(섹터 무제한) — config.risk_limits.exceptions에서 관리

## Meta Manager (실전 투자)

15명 시뮬레이션 데이터를 종합 분석하여 실전 매매를 결정하는 AI 시스템.

**핵심 원칙**: 코스피 대비 초과 수익 (알파 양수 유지)

**운영 방식**: 반자동 — 분석→결정→텔레그램 승인→KIS API 체결
- 실행 시점: 매일 13:30 (오전장 흐름 확인 후, 장마감까지 2시간 여유)
- 리밸런싱: **주 1회 수요일** 정규 리밸런싱 + **매일** 긴급 손절/익절 체크
- 증권사: 한국투자증권 (KIS Developers REST API)
- 초기 자금: 200만원

**파이프라인 흐름:**
```
[13:30] MetaManager.run() — 매일 실행, 3단계 분기

0. 안전 체크 (킬스위치, 일일/누적 손실 한도)
1. 매일: 긴급 체크 (손절 -7% / 익절 +10%)
   ├─ 트리거 있으면 → execute_emergency_orders()
   └─ 트리거 없으면 → 계속
2. 수요일이면 → 전체 분석 → Claude 배분 결정 → execute_allocation()
   수요일 아니면 → 스킵 (save_decision(decision_type="skip"))
```

**보호 장치 (config.risk_limits.meta_manager):**
- 리밸런싱 주기: 주 1회 수요일 (`rebalance_day: "wednesday"`)
- 손절/익절: -7% 손절 (보유기간 무시), +10% 익절 (보유기간 충족 시)
- 최소 보유기간: 3영업일 (`min_holding_days: 3`) — 중간 구간(-7%~+10%)은 홀딩 강제
- 회전율 한도: 총자산 40% (`max_turnover_pct: 40`) — 초과 시 비례 축소
- 안정화 기간: ~2026-04-10 대형주 위주 (`stabilization_end_date`)

**안전 장치:**
- 일일 손실 -3% → 자동 거래 중단
- 누적 손실 -10% → 전량 청산
- 킬스위치: `config.risk_limits.meta_manager.kill_switch`
- 장 운영시간(09:00~15:20) 외 주문 차단
- 텔레그램 승인 필수 (5분 타임아웃 시 취소)

### 메타 매니저 자동 실행 ("메타 매니저 실행해줘")

> `meta_cron.sh`에서 Claude CLI로 호출됨. 아래 절차를 순서대로 수행한다.

#### Step 1: 실행 + 상태 확인
- `python3 scripts/core/meta_manager.py` 실행
- status에 따라 분기:
  - `awaiting_decision` → Step 2로 (정규 리밸런싱, 수요일)
  - `emergency_triggered` → Step 3b로 (긴급 손절/익절)
  - `skip` → 비리밸런싱일 + 긴급 매매 없음 → 종료
  - `killed` / `daily_loss_halt` / `emergency_liquidated` → 해당 상태를 텔레그램으로 알리고 종료

#### Step 2: 배분 결정 (Claude AI 판단, 수요일만)
분석 리포트를 바탕으로 최적 종목 배분을 결정한다. 판단 기준:
- **스코어카드 추천(⭐) 전략의 현재 포지션**을 우선 참고
- **현재 마켓 레짐**에 맞는 공격/방어 비중 조절 (bull→공격적, bear→방어적)
- **리스크 플래그**가 많은 전략은 회피
- **최근 5일 모멘텀** 상위 전략의 종목을 우선 고려
- **포지션 겹침률**이 높은 종목은 분산 효과가 낮으므로 주의
- **보유기간 제약** 확인: 리포트에 표시된 "보유필수" 종목은 매도 불가
- **안정화 기간**이면 대형주(시총 상위 30)만 배분 가능
- stock_universe 종목만 사용, 배분 합계 ≤ 0.95, 최소 현금 5% 유지
- 결과: `target_allocation` ({"005930.KS": 0.15, ...}), `rationale` (근거 텍스트), `selected_strategies` (참고한 전략)

#### Step 3a: execute_allocation() 호출 (정규 리밸런싱)
배분 결정 후 아래 Python 코드를 Bash로 실행:
```bash
cd scripts/core && python3 -c "
from meta_manager import MetaManager
mm = MetaManager(date_str='YYYY-MM-DD')
result = mm.execute_allocation(
    target_allocation={...},      # Step 2에서 결정한 배분
    rationale='...',              # Step 2에서 작성한 근거
    selected_strategies={...},    # 참고한 전략 {'H': 0.4, 'O': 0.3, ...}
    regime='bull',                # Step 1 리포트의 레짐
)
print(result)
"
```
- `execute_allocation()` 내부: 배분 검증 → 보유기간/안정화/회전율 필터 → 주문 생성 → 텔레그램 승인 → KIS API 체결 → meta_decisions + real_portfolio 저장

#### Step 3b: execute_emergency_orders() 호출 (긴급 손절/익절)
Step 1에서 `emergency_triggered` 반환 시:
```bash
cd scripts/core && python3 -c "
from meta_manager import MetaManager
mm = MetaManager(date_str='YYYY-MM-DD')
result = mm.execute_emergency_orders(
    orders=[...],               # Step 1에서 반환된 emergency_orders
    decision_type='emergency_stop_loss',  # 또는 'emergency_take_profit'
    regime='neutral',
)
print(result)
"
```
- 긴급 매도만 실행 (신규 매수 없음)
- 텔레그램 승인 필수 → KIS API 매도 → 저장
- 결과를 확인하고 최종 상태를 텔레그램으로 알린다

## Web Dashboard

**배포 URL**: https://investment-phi-six.vercel.app/

`web/` — Next.js (TypeScript + Tailwind) 대시보드. 시뮬레이션 결과를 시각적으로 확인. Vercel로 배포.
- 메인(`/`): 투자자 순위(전일 대비 변동 표시), 오늘의 매매(매수/매도 테이블, 정렬), 주간 MVP/연승, 시장 현황(종목 검색+정렬), 뉴스
- 실전 투자(`/live`): 실전 포트폴리오 현황(총자산/일일수익률/KOSPI누적/알파), 자산 추이 차트, 보유종목, 메타 매니저 매매 히스토리(레짐/전략/주문 상세)
- 투자자 목록(`/investors`): 전체 15명 카드 그리드, 순위/수익률 표시
- 투자자 상세(`/investors/[id]`): 카툰 아바타, 뱃지, 포트폴리오 차트, 자산 구성 변화(stacked area), 성과 기여도(종목별 바차트+섹터별 Treemap), 보유종목, 거래내역, 투자 방법론(대표인물/참고링크), G는 감성 점수 추이
- 리포트(`/reports`): 좌우 분할 마스터-디테일 레이아웃 (데스크탑: 왼쪽 달력+날짜목록 sticky | 오른쪽 코멘터리+투자자 현황+일기+매매내역+뉴스, 모바일: 접기/펼치기 캘린더), 전일 대비 순위 변동 표시
- 종목 분석(`/stocks`): 섹터 히트맵, 섹터 비중, 국내주식(85개)/ETF(15개) 분리 목록, 종목 검색(debounce), 현재가/등락률/보유 정렬
- 종목 상세(`/stocks/[ticker]`): 가격 차트, ETF면 구성정보(섹터 비중+구성 종목), 보유 투자자, 거래내역
- 분석(`/analysis`): 전략 스코어카드(6개 카테고리 종합 평가, 실전 추천 뱃지, 백테스트 괴리율), 성과 지표(샤프/MDD/변동성/알파/승률), 수익률 상관관계 히트맵, 포지션 겹침률, 종목 인기도, 성과 기여도 분석(투자자별 섹터 기여도 비교)
- 대결(`/versus`): 추천 대결, 자유 선택, 주간 MVP/꼴찌, 연승 기록
- 대결 상세(`/versus/[matchup]`): 1:1 자산 비교, 일별 수익률 차이, 포지션 비교
- 리그(`/league`): 월간 시즌제 승점 순위(1위=15점~15위=1점), 누적 승점 추이 차트, 시즌 아카이브
- Supabase에서 데이터를 읽어 서버 컴포넌트에서 렌더링 (DB 직접 쿼리)
- Node 20+ 필요, 상세 내용은 `web/CLAUDE.md` 참조

```bash
cd web && pnpm dev    # 개발 서버 (localhost:4000)
cd web && pnpm build  # 빌드
```

## Key Preferences

- stock_universe 종목 변경은 반드시 사용자 확인 후 진행 (임의 선정 금지)
- 현재 100종목 (일반주 85개 + ETF 15개)
- 뉴스 파일에는 원문만 저장, 투자 판단은 투자자별 독립 수행
- "문서 업데이트"는 다음 세 곳을 모두 포함한다: **CLAUDE.md** (프로젝트 지침) + **README.md** (프로젝트 소개) + **GitHub 해당 이슈** (진행 상황 코멘트)
- 웹 UI 변경 시 사용자 검수 완료 전까지 빌드/커밋/푸시 금지 (검수 완료 확인 후 진행)

## Daily Pipeline Trigger

수동 실행 시 **시뮬레이션**과 **스토리텔링**은 별도 요청으로 나뉜다.
- 시뮬레이션: 장 시작 후 (시가 확정 후) — "시뮬레이션 진행해줘"
- 스토리텔링: 장마감 후 (종가 확정 후) — "스토리텔링 해줘"

### Part A: 시뮬레이션 ("시뮬레이션 진행해줘")

> **텔레그램 알림**: 각 Step 시작/완료 시 `scripts/core/daily_pipeline.py`의 `notify()` 함수로 진행 상황을 텔레그램으로 발송한다.

**Part 시작 알림**: `notify("📋 *Part A: 시뮬레이션 시작* ({date})")`

#### Step 1: 뉴스 수집
- `notify("🔍 Step 1: 뉴스 수집 시작")`
- WebSearch로 한국 증시 관련 뉴스 검색 (경제, 산업, 기업, 정책, 글로벌, 금융/보험, 통신/IT, 제약/바이오, 건설/부동산, 소비재/유통, 반도체/전자, 게임/엔터, 로봇/AI, 2차전지/에너지, 방산/우주, 뷰티/의료기기)
- 15~20건 수집 후 `scripts/core/daily_pipeline.py`의 `save_news()`로 Supabase에 저장
- 각 기사에 `url` 필드 포함: `{"title": ..., "summary": ..., "category": ..., "source": ..., "url": "https://..."}`
- `notify("✅ Step 1 완료: 뉴스 {N}건 수집")`

#### Step 2: 투자자별 배분 결정 (15개 독립 AI 에이전트 병렬 실행)
- `notify("🧠 Step 2: 투자자별 배분 결정 시작 (15명 병렬)")`
**반드시 15개의 서브에이전트(Agent tool)를 동시에 병렬 실행**하여 각 투자자의 배분을 독립적으로 결정한다.
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
- L 에이전트에는 추가로 `scripts/modules/momentum_data.py`의 `get_momentum_data()` 결과를 전달 (코스닥 성장주 발굴). 분할매도 규칙: +15% 1/3매도, +30% 1/2매도, +50% 전량매도, -10% 손절. allocation은 **신규 진입 종목만** 포함 (기존 보유종목의 목표가 매도는 simulate.py가 자동 처리)
- M 에이전트에는 추가로 `scripts/modules/market_regime.py`의 `get_market_regime()` 결과를 전달. 레짐에 따라 allocation 합계를 조절: bull→0.9, neutral→0.5, bear→0.3 (나머지는 현금)
- N 에이전트에는 추가로 `scripts/modules/momentum_data.py`의 `get_momentum_data()` + `scripts/modules/quality_metrics.py`의 `get_quality_metrics()` + `scripts/modules/institutional_flow.py`의 `get_institutional_flows()` 결과를 전달 (3중 필터로 최고 확신 2~3종목 선별)
- O 에이전트에는 추가로 `scripts/modules/momentum_data.py`의 `get_momentum_data()` + `scripts/modules/technical_indicators.py`의 `get_technical_signals()` 결과를 전달 (모멘텀+기술적 진입점 판단)
- 에이전트는 분석 후 `save_allocation()`으로 Supabase에 저장
- rationale(배분 근거) 텍스트는 논점별로 줄바꿈(`\n`) 삽입하여 가독성 확보
- allocation 합계 ≤ 1.0 (M 오판단은 현금비중만큼 합계 < 1.0), stock_universe 종목만 사용
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
- L (분할매도 전략): 코스닥 성장주 위주 5~8종목. **신규 진입 종목만 allocation에 포함**. 기존 보유종목의 +15%/+30%/+50% 분할매도 및 -10% 손절은 simulate.py의 `check_target_prices()`가 자동 처리
- M (마켓 타이밍): 레짐에 따라 현금비중 조절. **allocation 합계 = 1.0 - 현금비중** (bull: 0.9, neutral: 0.5, bear: 0.3). 3~10종목
- N (집중투자): **최대 2~3종목만** (4종목 초과 금지). 모멘텀+펀더멘털+수급 모두 양호한 최고 확신 종목에 올인. allocation 합계 = 1.0
- O (단기 스윙 수익실현): 모멘텀+기술적 분석으로 단기 반등 종목 선별, 5~8종목. **신규 진입 종목만 allocation에 포함**. 익절: 전일 대비 총자산 +5% 달성 시 전 종목 매도. 손절: 개별 종목 매수가 대비 -3% 시 해당 종목만 매도. 장중 o_monitor.py(실시간) 또는 simulate.py(과거 날짜)가 자동 처리

- `notify("✅ Step 2 완료: 15명 배분 결정 저장")`

#### Step 3: 시뮬레이션 실행 (시가 체결)
- `notify("⚙️ Step 3: 시뮬레이션 실행")`
- `python3 scripts/core/simulate.py {date}` 실행
- 시가(Open) 기준 주가 조회 → 리밸런싱 due 체크 → 매매 실행 → 리포트 생성
- (simulate.py 내부에서 이벤트 감지 & 리스크 체크 & 텔레그램 자동 발송)

#### Step 4: 결과 요약
- 각 투자자별 총자산, 수익률, 오늘 거래 내역 보고
- `notify("✅ *Part A 완료* ({date}) — 시뮬레이션 결과가 저장되었습니다.")`

### Part B: 스토리텔링 ("스토리텔링 해줘")

> **장마감(15:30) 이후 실행 권장** — 종가가 확정된 후 코멘터리를 작성해야 당일 시장 동향이 정확하게 반영된다.

**Part 시작 알림**: `notify("📝 *Part B: 스토리텔링 시작* ({date})")`

#### Step 0: 종가 반영
- `notify("📊 Step 0: 종가 반영 시작")`
- `python3 scripts/core/simulate.py {date} --close` 실행
- 종가(Close) 기준으로 market_prices, 포트폴리오 평가, 순위를 재계산하여 `daily_reports` 업데이트
- 매매 정보(trades_today, rebalanced_today)는 기존 시가 체결 데이터를 그대로 유지
- `notify("✅ Step 0 완료: 종가 반영")`

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
- L 신장모: 실현주의자, 확고한 ("수익은 실현해야 내 돈이다", "욕심부리면 다 날린다", "15% 찍고 1/3 정리했다")
- M 오판단: 냉정한 타이머 ("지금은 쉴 때다", "시장이 부를 때만 들어간다", "이평선이 말해주고 있다")
- N 전몰빵: 확신의 투자자, 당당한 ("확신이 없으면 안 한다", "분산은 무지에 대한 방어일 뿐이다", "이 종목 하나면 충분하다")
- O 정익절: 냉철한 트레이더, 기계적 ("5% 찍고 바로 정리했다", "손절은 보험료다", "작은 수익이 모여 큰 돈이 된다")

**저장**: `scripts/core/daily_pipeline.py`의 `save_stories(date_str, commentary, diaries)` 호출
- `diaries`는 `{"강돌진": "일기 내용...", "김균형": "...", ..., "전몰빵": "...", "정익절": "..."}` 형태 (투자자 이름 키)
- `notify("✅ *Part B 완료* ({date}) — 코멘터리 & 투자자 일기가 저장되었습니다.")`

### 주의사항
- 리밸런싱 due가 아닌 투자자는 allocation이 있어도 매매 스킵
- A/G/H/L/M/O은 매일, D는 3영업일마다, B/J/N은 7영업일마다, E/F는 14영업일마다, C/K는 30영업일마다, I는 90영업일마다만 실행 (holidays.KR 기반 휴장일 제외)
- 첫날은 `last_rebalanced: null`이므로 모두 실행
