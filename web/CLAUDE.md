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
    page.tsx                 ← 메인 대시보드 (순위, 코멘터리, 시장현황, 뉴스)
    layout.tsx               ← 루트 레이아웃 (다크 테마)
    investors/[id]/page.tsx  ← 투자자 상세 (일기, 차트, 보유종목, 거래내역)
  components/
    RankingTable.tsx          ← 투자자 순위표
    MarketTable.tsx           ← 시장 현황 테이블
    PortfolioChart.tsx        ← 포트폴리오 파이차트 (recharts)
    HoldingsTable.tsx         ← 보유종목 테이블
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
- `getLatestReportDate()` → `daily_reports` 최신 date

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
