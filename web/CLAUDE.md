# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

모의 투자 시뮬레이션 대시보드. Next.js 15 + TypeScript + Tailwind CSS + Recharts.
프로젝트 루트(`../`)의 JSON 데이터를 서버 컴포넌트에서 `fs`로 직접 읽어 렌더링한다.

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
    page.tsx                 ← 메인 대시보드 (순위, 시장현황, 뉴스)
    layout.tsx               ← 루트 레이아웃 (다크 테마)
    investors/[id]/page.tsx  ← 투자자 상세 (차트, 보유종목, 거래내역)
  components/
    RankingTable.tsx          ← 투자자 순위표
    MarketTable.tsx           ← 시장 현황 테이블
    PortfolioChart.tsx        ← 포트폴리오 파이차트 (recharts)
    HoldingsTable.tsx         ← 보유종목 테이블
  lib/
    data.ts                   ← JSON 파일 읽기 (모든 타입 정의 포함)
    format.ts                 ← 포맷 유틸 (krw, pct, signColor)
```

## Data Layer

`lib/data.ts`가 프로젝트 루트의 JSON 파일을 `fs.readFileSync`로 읽는다.
- `getConfig()` → `../config.json`
- `getProfile(id)` → `../investors/profiles/{id}.json`
- `getPortfolio(id)` → `../investors/portfolios/{id}.json`
- `getAllocation(id, date)` → `../investors/allocations/{id}/{date}.json`
- `getDailyReport(date)` → `../report/daily/{date}.json`
- `getNews(date)` → `../news/{date}.json`
- `getLatestReportDate()` → 가장 최근 리포트 날짜

나중에 DB로 전환 시 `lib/data.ts`의 함수 구현만 교체하면 된다.

## Key Conventions

- 서버 컴포넌트에서 데이터 로드 (클라이언트 fetch 없음)
- `"use client"` — recharts 등 브라우저 API 필요한 컴포넌트만
- 다크 테마 고정 (배경 `#0f172a`)
- 한국 주식 색상: 상승=빨강(`text-red-500`), 하락=파랑(`text-blue-500`)
- 금액 포맷: `krw()`, 퍼센트: `pct()`, 색상: `signColor()`
- `export const dynamic = "force-dynamic"` — 페이지가 항상 최신 JSON 반영
