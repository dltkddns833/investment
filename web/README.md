# 모의 투자 대시보드

> **배포 URL**: https://investment-phi-six.vercel.app/

Next.js 15 + TypeScript + Tailwind CSS + Recharts 기반 시뮬레이션 결과 시각화 대시보드.

## 실행

```bash
pnpm install
pnpm dev     # localhost:4000
pnpm build   # 프로덕션 빌드
```

Node 20+ 필요.

## 환경변수

`.env.local` 파일에 다음 변수 필요:

```
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## 페이지 구성

| 경로 | 설명 |
|------|------|
| `/` | 투자자 순위(투자성향 뱃지 포함), 마켓 코멘터리, 시장 현황, 뉴스 |
| `/investors` | 전체 투자자 카드 목록, 순위/수익률/투자성향 뱃지 |
| `/investors/[id]` | 투자자 일기, 자산 추이 차트, 목표 배분, 보유종목, 거래내역, 투자성향 뱃지 |
| `/reports` | 달력 히트맵, 월간 수익률 |
| `/stocks` | 섹터 히트맵, 투자자별 섹터 비중, 국내주식/ETF 분리 목록 |
| `/stocks/[ticker]` | 가격 차트, ETF 구성정보(섹터 비중·구성 종목), 보유 투자자, 거래내역 |
| `/analysis` | 수익률 상관관계 히트맵, 포지션 겹침률, 종목 인기도 |
| `/versus` | 추천 대결, 자유 선택, 주간 MVP/꼴찌, 연승 기록 |
| `/versus/[matchup]` | 1:1 자산 비교, 일별 수익률 차이, 포지션 비교 |
| `/news` | 날짜별 뉴스 카드, 섹터별 아이콘 |

## 실시간 가격

- **장중** (09:00~15:30): Yahoo Finance에서 실시간 가격 조회, LIVE 뱃지 표시
- **장마감 후** (15:30~): 종가 자동 조회, 종가 뱃지 표시, 포트폴리오 재계산
- API: `/api/live-prices` (현재가), `/api/stock-chart` (OHLC 차트 데이터)
