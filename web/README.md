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
| `/` | 투자자 순위, 마켓 코멘터리, 시장 현황, 뉴스 |
| `/investors/[id]` | 투자자 일기, 자산 추이 차트, 목표 배분, 보유종목, 거래내역 |
| `/reports` | 달력 히트맵, 월간 수익률 |
| `/stocks` | 섹터 히트맵, 투자자별 섹터 비중, 전체 종목 리스트 |
| `/stocks/[ticker]` | Yahoo Finance 가격 차트(1M/3M/6M/1Y), 보유 투자자, 거래내역 |

## 실시간 가격

- **장중** (09:00~15:30): Yahoo Finance에서 실시간 가격 조회, LIVE 뱃지 표시
- **장마감 후** (15:30~): 종가 자동 조회, 종가 뱃지 표시, 포트폴리오 재계산
- API: `/api/live-prices` (현재가), `/api/stock-chart` (OHLC 차트 데이터)
