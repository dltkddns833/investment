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
    investors/[id]/page.tsx  ← 투자자 상세 (뱃지, 일기, 차트, 보유종목, 거래내역)
    reports/page.tsx         ← 리포트 (달력 히트맵, 월간 수익률)
    stocks/page.tsx          ← 종목 분석 (섹터 히트맵, 섹터 비중, 종목 리스트)
    stocks/[ticker]/page.tsx ← 종목 상세 (가격 차트, 보유자, 거래내역)
    analysis/page.tsx        ← 투자자 분석 (상관관계 히트맵, 포지션 겹침률, 종목 인기도)
    versus/page.tsx          ← 대결 구도 (추천 대결, 자유 선택, 주간 MVP/꼴찌, 연승)
    versus/[matchup]/page.tsx ← 1:1 대결 상세 (자산 비교, 수익률 차이, 포지션 비교)
  components/
    RankingTable.tsx          ← 투자자 순위표
    MarketTable.tsx           ← 시장 현황 테이블
    PortfolioChart.tsx        ← 포트폴리오 파이차트 (recharts)
    HoldingsTable.tsx         ← 보유종목 테이블
    CalendarHeatmap.tsx       ← 달력 히트맵 (수익률 색상)
    PeriodSelector.tsx        ← 투자자 탭 + 월 이동
    SectorHeatmap.tsx         ← 섹터별 등락 색상 타일
    SectorWeights.tsx         ← 투자자별 섹터 비중 바
    CorrelationHeatmap.tsx    ← 수익률 상관관계 10×10 히트맵
    OverlapMatrix.tsx         ← 포지션 겹침률 매트릭스
    StockPopularityChart.tsx  ← 종목별 보유 투자자 수 차트
    VersusChart.tsx           ← 1:1 자산 비교 라인 차트
    VersusReturnDiff.tsx      ← 일별 수익률 차이 바 차트
    VersusPositionCompare.tsx ← 포지션 비교 3컬럼
    MatchupCard.tsx           ← 추천 대결 카드
    InvestorPairSelector.tsx  ← 투자자 선택 드롭다운
    WeeklyHighlights.tsx      ← 주간 MVP/꼴찌/연승 카드
    BadgeList.tsx             ← 투자자 뱃지 목록
  lib/
    supabase.ts               ← Supabase 클라이언트 (서버 전용, service_role key)
    data.ts                   ← Supabase 쿼리 (모든 타입 정의 포함, async 함수)
    format.ts                 ← 포맷 유틸 (krw, pct, signColor)
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
- `getPeriodSummary(startDate, endDate)` → 기간별 투자자 성과 요약
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
