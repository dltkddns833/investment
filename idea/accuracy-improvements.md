# 정확성/안정성 개선 목록

기능 추가가 아닌, 기존 로직의 정확성과 안정성을 높이기 위한 개선 사항.

---

## 1. 리밸런싱 거래일 기준 오류 [높음]

**파일:** `scripts/core/portfolio.py` (line 92, 130)

**문제:** `buy()`, `sell()` 함수에서 거래일을 `datetime.now()`로 기록.
시뮬레이션이 특정 날짜(`date_str`)로 실행되더라도 transactions 테이블에는 항상 실행 시점의 날짜가 저장된다.
과거 날짜로 시뮬레이션하거나, 자정 전후 실행 시 거래일이 틀어질 수 있음.

**수정 방향:** `buy()`, `sell()` 함수에 `date_str` 파라미터를 추가하고, `rebalance()`에서 시뮬레이션 날짜를 전달.

---

## 2. 리밸런싱 중 반복 DB 호출 [중간]

**파일:** `scripts/core/portfolio.py` — `rebalance()`

**문제:** 매도/매수 한 건마다 `load_portfolio()` → Supabase 쿼리 반복 호출.
35종목 기준 최대 수십 회 DB 왕복 발생. 네트워크 지연 누적.

**수정 방향:** 메모리에서 포트폴리오 상태를 관리하며 매매 처리 후, 마지막에 한 번만 `save_portfolio()` 호출. transactions INSERT도 배치로 처리.

---

## 3. quality_metrics의 market_cap_tier 미설정 [중간]

**파일:** `scripts/modules/quality_metrics.py` (line 56)

**문제:** `market_cap_tier`를 config의 `stock_universe`에서 읽지만, 실제로 해당 필드가 없어서 항상 `"mid"` 폴백.
C 투자자(보수적 우량주)의 안정성 점수(stability_score)에서 시총 점수가 모든 종목 동일하게 2점으로 계산됨.

**수정 방향:** `stock_universe`에 `market_cap_tier` 필드 추가 (large/mid/small). 또는 yfinance `info['marketCap']`에서 동적으로 판별.

---

## 4. 리밸런싱 빈도 — 휴장일 미반영 [낮음]

**파일:** `scripts/core/portfolio.py` — `is_rebalance_due()`

**문제:** 단순 캘린더일 차이로 리밸런싱 주기를 계산.
주말/공휴일이 포함되어, "3일마다"인 D 투자자가 금요일 실행 후 월요일에 다시 실행됨 (영업일 기준 1일).
"7일마다"인 B/J도 공휴일 끼면 영업일 기준 4~5일 만에 실행될 수 있음.

**수정 방향:** `holidays` 패키지(이미 설치됨)를 활용하여 영업일 기준으로 계산하거나, `rebalance_frequency_days`의 의미를 "영업일"로 명확히 재정의.
