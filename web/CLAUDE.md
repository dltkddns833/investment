# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

모의 투자 시뮬레이션 대시보드. Next.js 15 + TypeScript + Tailwind CSS + Recharts.
Supabase(PostgreSQL)에서 데이터를 읽어 서버 컴포넌트에서 렌더링한다.

## Commands

```bash
pnpm dev     # 개발 서버 (localhost:4000)
pnpm build   # 프로덕션 빌드
pnpm start   # 프로덕션 서버
pnpm lint    # ESLint
```

Node 18+ 필요. nvm 사용 시: `nvm use 18`

## Architecture

```
src/
  app/
    page.tsx                 ← 메인 대시보드 (순위, 주간 MVP/연승, 코멘터리, 시장현황, 뉴스)
    layout.tsx               ← 루트 레이아웃 (다크 테마)
    investors/page.tsx       ← 투자자 목록 (카드 그리드, 순위/수익률)
    investors/[id]/page.tsx  ← 투자자 상세 (뱃지, 일기, 차트, 보유종목, 거래내역)
    reports/page.tsx         ← 리포트 (좌우 분할: 달력+날짜목록 | 코멘터리+순위+일기+뉴스)
    stocks/page.tsx          ← 종목 분석 (섹터 히트맵, 섹터 비중, 국내주식/ETF 분리 목록)
    stocks/[ticker]/page.tsx ← 종목 상세 (가격 차트, ETF 구성정보, 보유자, 거래내역)
    analysis/page.tsx        ← 투자자 분석 (성과 지표, 상관관계 히트맵, 포지션 겹침률, 종목 인기도)
    versus/page.tsx          ← 대결 구도 (추천 대결, 자유 선택, 주간 MVP/꼴찌, 연승)
    versus/[matchup]/page.tsx ← 1:1 대결 상세 (자산 비교, 수익률 차이, 포지션 비교)
    league/page.tsx          ← 리그 (월간 시즌제 승점 순위, 누적 승점 차트, 시즌 아카이브)
    api/daily-detail/route.ts ← 날짜별 상세 API (코멘터리, 뉴스, 순위, 전일 순위)
  components/
    RankingTable.tsx          ← 투자자 순위표 (전일 대비 순위 변동 표시)
    MarketTable.tsx           ← 시장 현황 테이블
    PortfolioChart.tsx        ← 포트폴리오 파이차트 (recharts)
    HoldingsTable.tsx         ← 보유종목 테이블
    CalendarHeatmap.tsx       ← 달력 히트맵 (수익률 색상)
    ReportsContent.tsx        ← 리포트 좌우 분할 레이아웃 (데스크탑: 마스터-디테일, 모바일: 접기/펼치기)
    DailyDetailPanel.tsx      ← 날짜별 상세 패널 (코멘터리, 투자자 현황+일기 통합, 뉴스)
    SectorHeatmap.tsx         ← 섹터별 등락 색상 타일
    SectorWeights.tsx         ← 투자자별 섹터 비중 바
    CorrelationHeatmap.tsx    ← 수익률 상관관계 11×11 히트맵
    OverlapMatrix.tsx         ← 포지션 겹침률 매트릭스
    StockPopularityChart.tsx  ← 종목별 보유 투자자 수 차트
    EtfDetail.tsx             ← ETF 구성정보 (섹터 비중 바, 주요 구성 종목)
    VersusChart.tsx           ← 1:1 자산 비교 라인 차트
    VersusReturnDiff.tsx      ← 일별 수익률 차이 바 차트
    VersusPositionCompare.tsx ← 포지션 비교 3컬럼
    MatchupCard.tsx           ← 추천 대결 카드
    InvestorPairSelector.tsx  ← 투자자 선택 드롭다운
    WeeklyHighlights.tsx      ← 주간 MVP/꼴찌/연승 카드
    LeagueTable.tsx           ← 리그 승점 순위 테이블 (승점 프로그레스바, 평균순위, 1위횟수)
    LeaguePointsChart.tsx     ← 누적 승점 추이 라인 차트 (투자자별 컬러)
    SeasonHistory.tsx         ← 시즌 아카이브 카드 (우승자, Top 3 포디움)
    BadgeList.tsx             ← 투자자 뱃지 목록 (시즌 우승 뱃지 포함)
    InvestorAvatar.tsx        ← 투자자 카툰 아바타 (대표 인물 기반 SVG)
    AllInvestorsAssetChart.tsx ← 전체 투자자 자산 추이 라인 차트
    PerformanceStatsTable.tsx ← 성과 지표 테이블 (샤프/MDD/승률/변동성/알파, 클릭 정렬)
    InvestorRadarChart.tsx    ← 성과 지표 레이더 차트 (5축, 상위 5명 기본, 클릭 토글)
    AssetCompositionChart.tsx ← 투자자별 자산 구성 변화 Stacked Area 차트
    SentimentTrendChart.tsx   ← G 문여론 감성 점수 추이 바 차트
  lib/
    supabase.ts               ← Supabase 클라이언트 (서버 전용, service_role key)
    data.ts                   ← Supabase 쿼리 (모든 타입 정의 포함, async 함수)
    format.ts                 ← 포맷 유틸 (krw, pct, signColor)
    investor-colors.ts        ← 투자자 고유 컬러 시스템 (A~K, 전체 앱에서 일관 사용)
    methodology.ts            ← 투자자별 방법론/대표인물/참고링크 데이터 (A~K)
    etf-data.ts               ← ETF 구성정보 정적 데이터 (12개 ETF 섹터 비중/구성 종목)
    sector-icons.tsx          ← 섹터별 SVG 아이콘 (ETF 카테고리 포함)
```

## Data Layer

`lib/data.ts`가 Supabase에서 데이터를 async로 조회한다.
- `getConfig()` → `config` 테이블 (id=1)
- `getProfile(id)` → `profiles` 테이블
- `getPortfolio(id)` → `portfolios` + `transactions` + `rebalance_history` 조인
- `getAllocation(id, date)` → `allocations` 테이블
- `getDailyReport(date)` → `daily_reports` 테이블
- `getNews(date)` → `news` 테이블
- `getDailyStories(date)` → `daily_stories` 테이블 (코멘터리 & 투자자 일기)
- `getDailyReturns(investorName, year, month)` → 히트맵용 일별 수익률
- `getPrevRankMap(date)` → 전일 대비 순위 변동 계산용 이전 순위 맵
- `getStockTransactions(ticker)` → 종목별 거래내역
- `getLatestReportDate()` → `daily_reports` 최신 date
- `getAllDailyReports()` → 전체 daily_reports (date, rankings, investor_details)
- `getReturnCorrelationMatrix(investorNames)` → 투자자 간 Pearson 상관계수
- `getPositionOverlaps(investorDetails)` → 보유 종목 Jaccard 유사도 (순수 함수)
- `getStockPopularity(investorDetails, stockUniverse)` → 종목별 보유 투자자 수 (순수 함수)
- `getStreaks()` → 연속 1위 기록 추적
- `getWeeklyMVPs()` → ISO 주 단위 최고/최저 투자자
- `getBadges()` → 마일스톤 감지 (첫 수익, 600만 돌파, 연속 1위 등)
- `getVersusData(investorA, investorB)` → 1:1 대결 데이터 (자산 추이, 수익률 차이, 승패)
- `getPerformanceStats(investorNames, investorIds)` → 샤프비율/MDD/변동성/알파/승률 (tradingDays < 5이면 sharpe/mdd/volatility = null)
- `getAssetComposition(investorId)` → `portfolio_snapshots` 테이블에서 일별 종목+현금 구성 (stacked area용)
- `getSentimentHistory(investorId)` → `allocations` 테이블에서 G의 감성 점수 시계열
- `getPeriodicReports(periodType)` → `periodic_reports` 테이블에서 월간/분기 리포트
- `getLeagueStandings(seasonLabel?)` → 현재/과거 시즌 승점 순위 (현재: on-the-fly 계산, 과거: periodic_reports.league_standings)
- `getSeasonHistory()` → 완료된 시즌 목록 (periodic_reports에서 league_standings 있는 월간 리포트)
- `getDailyLeaguePoints(seasonLabel?)` → 일별 누적 승점 (차트용)
- `getAllDailyStories()` → `daily_stories` 테이블에서 전체 코멘터리 & 투자자 일기 (날짜 역순)

모든 데이터 함수가 async이므로 페이지 컴포넌트도 `async function`으로 선언.

## Environment Variables

`.env.local` 파일에 다음 변수 필요:
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase 프로젝트 URL
- `SUPABASE_SERVICE_ROLE_KEY` — 서버 전용 service_role key

## Key Conventions

- 서버 컴포넌트에서 Supabase 직접 쿼리 (클라이언트 fetch 없음)
- `"use client"` — recharts 등 브라우저 API 필요한 컴포넌트만
- 다크 테마 고정 (배경 `#0f172a`)
- 한국 주식 색상: 상승=빨강(`text-red-500`), 하락=파랑(`text-blue-500`)
- 금액 포맷: `krw()`, 퍼센트: `pct()`, 색상: `signColor()`
- `export const dynamic = "force-dynamic"` — 페이지가 항상 최신 데이터 반영
- 투자자 고유 색상: `investor-colors.ts`의 `getInvestorColor(id)` / `getInvestorHex(id)` 사용 — 하드코딩 금지
- 투자자 아바타: `<InvestorAvatar investorId="A" size="sm|md|lg" />` — 이름 옆에 표시
