---
name: simulate
description: "한국 주식 모의투자 시뮬레이션 파이프라인 실행. 뉴스 수집 → 16명 투자자 배분 결정 (병렬) → 시가 체결 시뮬레이션. 사용자가 '시뮬레이션', '시뮬레이션 진행', '시뮬 돌려', 'Part A', '오늘 시뮬' 등을 언급하면 반드시 이 스킬을 사용한다."
---

# 시뮬레이션 파이프라인 (Part A)

한국 주식 모의투자 시뮬레이션. 16명 투자자(A~P)가 동일 종목 풀에서 각자 다른 전략으로 투자하여 성과를 비교한다.

## 사전 조건

- 장 운영일(평일, 공휴일 제외)에만 실행
- 오늘 날짜: KST 기준
- 프로젝트 루트: `/Users/isang-un/Desktop/personal/investment`

## 실행 절차

텔레그램 알림은 각 Step 시작/완료 시 `scripts/core/daily_pipeline.py`의 `notify()` 함수로 발송한다.

### Part 시작 알림
```python
from daily_pipeline import notify
notify("📋 *Part A: 시뮬레이션 시작* ({date})")
```

### Step 1: 뉴스 수집

`notify("🔍 Step 1: 뉴스 수집 시작")`

WebSearch로 한국 증시 관련 뉴스 15~20건 수집. 카테고리: 경제, 산업, 기업, 정책, 글로벌, 금융/보험, 통신/IT, 제약/바이오, 건설/부동산, 소비재/유통, 반도체/전자, 게임/엔터, 로봇/AI, 2차전지/에너지, 방산/우주, 뷰티/의료기기.

각 기사 형식:
```json
{"title": "...", "summary": "...", "category": "...", "source": "...", "url": "https://..."}
```

`save_news(date_str, articles)`로 Supabase 저장.

`notify("✅ Step 1 완료: 뉴스 {N}건 수집")`

### Step 2: 투자자별 배분 결정 (15개 병렬 에이전트)

`notify("🧠 Step 2: 투자자별 배분 결정 시작 (16명 병렬)")`

**반드시 15개 서브에이전트(Agent tool)를 동시에 병렬 실행**한다. 각 에이전트는 독립적으로 자기 투자자의 배분만 결정한다.

#### 에이전트에 전달할 공통 정보
- 투자자 프로필 (Supabase `profiles` 테이블)
- 오늘 뉴스 (Step 1에서 수집)
- stock_universe 목록 (Supabase `config` 테이블)
- 현재 포트폴리오 상태 (Supabase `portfolios` 테이블)

#### 투자자별 추가 데이터 & 전략

| ID | 이름 | 전략 | 추가 모듈 | 종목수 | allocation 합계 |
|----|------|------|-----------|--------|----------------|
| A | 강돌진 | 공격적 모멘텀 | `momentum_data.get_momentum_data()` | 5~8 | 1.0 |
| B | 김균형 | 균형 분산 | `sector_analysis.get_sector_analysis()` | 10~15 | 1.0 |
| C | 이든든 | 보수적 우량주 | `quality_metrics.get_quality_metrics()` + `dividend_data.get_dividend_data()` | 5~10 | 1.0 |
| D | 장반대 | 역발상 투자 | `momentum_data.get_momentum_data()` (낙폭 과대 집중) | 5~8 | 1.0 |
| E | 정기준 | 동일 가중 벤치마크 | 없음 (전 종목 1/N 균등, AI 판단 없이 기계적) | 전종목 | 1.0 |
| F | 윤순환 | 섹터 로테이션 | `sector_analysis.get_sector_analysis()` (상위 2~3섹터 집중) | 섹터당2~3 | 1.0 |
| G | 문여론 | 뉴스 감성 기반 | 없음 (감성 점수만 사용, `sentiment_scores` 전달) | 5~10 | 1.0 |
| H | 박기술 | 기술적 분석 | `technical_indicators.get_technical_signals()` | 5~8 | 1.0 |
| I | 최배당 | 배당 투자 | `dividend_data.get_dividend_data()` | 5~10 | 1.0 |
| J | 한따라 | 스마트머니 추종 | 뉴스 중 외국인/기관 수급 강조 | 5~8 | 1.0 |
| K | 로로캅 | 글로벌 자산배분 | `asset_allocation.get_asset_allocation_data()` (**ETF만**) | 4~8 | 1.0 |
| L | 신장모 | 분할매도 전략 | `momentum_data` + `technical_indicators` | 3~8 | 레짐별(bull 0.9, neutral 0.7, bear 0.4~0.5) |
| M | 오판단 | 마켓 타이밍 | `market_regime.get_market_regime()` | 3~10 | 레짐별(bull 0.9, neutral 0.5, bear 0.3) |
| N | 전몰빵 | 집중투자 | `momentum_data` + `quality_metrics` + `institutional_flow.get_institutional_flows()` | **2~3** (4초과 금지) | 1.0 |
| O | 정익절 | 단기 스윙 | `momentum_data` + `technical_indicators` (**신규 진입만**) | 5~8 | 1.0 |
| P | 정삼절 | 고정 시드 스윙 | `momentum_data` + `technical_indicators` (**신규 진입만**) | 5~8 | 1.0 |

#### 특수 규칙
- **G 문여론**: `save_allocation()` 호출 시 `sentiment_scores` 인자 전달 (강한 긍정 +0.8~+1.0 ~ 강한 부정 -0.8~-1.0)
- **K 로로캅**: ETF 종목만 사용. 주식ETF↔채권ETF 시소 원리 적용
- **L 신장모**: RSI>70 / MACD 데드크로스 진입 금지. **신규 진입 종목만** allocation에 포함 (기존 보유는 simulate.py가 자동 병합)
- **M 오판단**: allocation 합계 = 1.0 - 현금비중
- **N 전몰빵**: 최대 2~3종목만. 모멘텀+펀더멘털+수급 3중 필터
- **O 정익절**: RSI>70 / MACD 데드크로스 진입 금지. **신규 진입 종목만** allocation에 포함
- **P 정삼절**: O와 동일 규칙. RSI>70 / MACD 데드크로스 진입 금지. **신규 진입 종목만** allocation에 포함. 차이: 매일 500만원 baseline 리셋 + cashflow 분리

#### 공통 규칙
- allocation 합계 ≤ 1.0, stock_universe 종목만 사용
- `save_allocation(investor_id, date_str, allocation, rationale, sentiment_scores)` 호출
- rationale 텍스트는 논점별로 줄바꿈(`\n`) 삽입

`notify("✅ Step 2 완료: 16명 배분 결정 저장")`

### Step 3: 시뮬레이션 실행 (시가 체결)

`notify("⚙️ Step 3: 시뮬레이션 실행")`

```bash
cd /Users/isang-un/Desktop/personal/investment && python3 scripts/core/simulate.py {date}
```

시가(Open) 기준 주가 조회 → 리밸런싱 due 체크 → 매매 실행 → 리포트 생성.
simulate.py 내부에서 이벤트 감지 & 리스크 체크 & 텔레그램 자동 발송.

### Step 4: 결과 요약

각 투자자별 총자산, 수익률, 오늘 거래 내역 보고.

`notify("✅ *Part A 완료* ({date}) — 시뮬레이션 결과가 저장되었습니다.")`

## 리밸런싱 주기 참고

- 매일: A, G, H, L, M, O, P
- 3영업일: D
- 7영업일(매주): B, J, N
- 14영업일(격주): E, F
- 30영업일(매월): C, K
- 90영업일(분기): I
- `last_rebalanced: null`이면 무조건 실행
