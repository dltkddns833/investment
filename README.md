# 모의 투자 시뮬레이션

3명의 가상 투자자(A/B/C)가 서로 다른 **투자 성향**과 **리밸런싱 빈도**로 한국 주식에 투자하여 성과를 비교하는 시뮬레이션.

## 투자자

| ID | 전략 | 리밸런싱 | 종목수 | 성향 |
|----|------|----------|--------|------|
| A | 공격적 모멘텀 | 매일 | 5~8 | 성장주/테마주 집중 |
| B | 균형 분산 | 매주 | 10~15 | 섹터 균등 분산 |
| C | 보수적 우량주 | 매월 | 5~10 | 대형주/배당주 위주 |

- 시드머니: 각 500만원 (KRW)
- 시장: KOSPI + KOSDAQ 20종목 (yfinance 기반 실시간 시세)

## 시뮬레이션 흐름

```
1. 뉴스 수집 → news/{date}.json
2. 투자자별 독립 분석/배분 결정 → investors/allocations/{A,B,C}/{date}.json
3. python3 scripts/simulate.py 실행
   → 주가 조회 → 리밸런싱 due 체크 → 매매 → 리포트 생성
4. 결과 확인 → report/daily/{date}.json 또는 웹 대시보드
```

## 설치 및 실행

```bash
# Python 의존성
pip3 install -r requirements.txt

# 시세 조회
python3 scripts/market.py

# 시뮬레이션 실행
python3 scripts/simulate.py 2026-03-10

# 웹 대시보드 (Node 20+ 필요)
cd web && npm install && npm run dev
```

## 프로젝트 구조

```
├── config.json              # 설정 (종목 유니버스, 투자자 목록)
├── scripts/
│   ├── market.py            # 주가 조회 (yfinance)
│   ├── portfolio.py         # 매수/매도/평가/리밸런싱
│   ├── report.py            # 리포트 생성
│   ├── simulate.py          # 시뮬레이션 오케스트레이터
│   └── daily_pipeline.py    # 뉴스/배분 저장 헬퍼
├── investors/
│   ├── profiles/            # 투자자 성향 (읽기 전용)
│   ├── portfolios/          # 보유 현황 (매매 시 갱신)
│   └── allocations/         # 일별 목표 배분 비율
├── news/                    # 일별 뉴스 수집
├── report/daily/            # 일간 성과 리포트
└── web/                     # Next.js 대시보드
```

## 웹 대시보드

Next.js + TypeScript + Tailwind CSS + Recharts로 구성된 시각화 대시보드.

- **메인** (`/`): 투자자 순위, 시장 현황, 뉴스
- **투자자 상세** (`/investors/[id]`): 포트폴리오 차트, 보유종목, 거래내역
