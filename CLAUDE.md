# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

한국 주식 모의 투자 시뮬레이션. 11명의 시뮬 투자자(A·C·D·E·F·G·H·I·J·K·M)가 종목 풀(100개, 일반주 85개 + ETF 15개)에서 **서로 다른 투자 성향과 리밸런싱 빈도**로 투자하여 성과를 비교하는 실험. 여기에 UF 이상운(C 옵션 한국 매크로 로테이션 추종)이 사용자 트랙으로 합류해 시뮬 11명과 같은 시드로 동일선상 비교 대상이 된다. Q 정채원은 KIS 1분봉을 직접 평가해 매분 매매하는 **실시간 분봉 기반 시뮬 스캘퍼**(일봉 기반 11명과 달리 분봉 정밀도)로, 본질이 다른 운영 사이클 때문에 **별도 앱 `web-q/`에서 운영 콘솔로 노출**한다. `web/` 시뮬 대시보드는 시뮬 11명 + UF 이상운(12명)만 표시. 매매는 Supabase `transactions`/`portfolios`에 기록되며 시뮬 11명·Q는 KIS 주문 API를 호출하지 않고 시세·분봉 조회 전용으로만 사용한다. **UF 이상운만 KIS 주문 API로 실전 매매**한다. DB는 과거 데이터(B·L·N·O·P 포함) 보존.

**2026-05-22 시즌2 시작 (C 옵션 한국 매크로 로테이션 추종)**: 시뮬 11명 + UF 이상운이 시드 **1,000만원**으로 동일선상 출발. 시즌1(2026-03-10 ~ 2026-05-21, 시드 500만)은 봉인됨 (DB는 `season_id=1`로 보존). 시즌2 데이터는 `season_id=2`로 누적. 6개 테이블에 `season_id` 컬럼 (transactions·portfolio_snapshots·daily_reports·allocations·rebalance_history·market_regimes) — `scripts/core/supabase_client.py`의 `get_current_season_id()` 헬퍼가 단일 진실 공급원이며, 모든 insert/upsert 지점이 자동 주입. **Q 정채원은 시즌 무관** (시즌1 누적 그대로 유지, `season_id=1` 고정).

**2026-05-08 정리**: B 김균형 / L 신장모 / N 전몰빵 / O 정익절 / P 정삼절 5명을 시뮬·대시보드에서 제외(소프트 제외). 코드/DB/과거 거래내역은 보존하며, `scripts/core/portfolio.py`의 `EXCLUDED_INVESTOR_IDS`와 `web/src/lib/data.ts`의 `EXCLUDED_INVESTOR_IDS`/`EXCLUDED_INVESTOR_NAMES`가 단일 진실 공급원.

**궁극적 목표**: 시뮬레이션에서 검증된 최적 전략을 선별하여 **실전 자동 투자 시스템**으로 발전시키는 것. UF 이상운(C 옵션 매크로 추종)이 시즌2 시작과 함께 첫 실전 자동 매매 트랙으로 가동 중. 시뮬 11명은 여전히 R&D 단계.

- 시드머니: 각 1,000만원 (KRW) — 시즌2 시점부터. 시즌1은 500만원으로 봉인
- 시장: KOSPI + KOSDAQ (yfinance 기반 실시간 시세)
- A 강돌진: 공격적 모멘텀 / 매일 리밸런싱 / 5~8종목 집중
- C 이든든: 보수적 우량주 / 매월 리밸런싱 / 5~10종목
- D 장반대: 역발상 투자 / 3일마다 리밸런싱 / 5~8종목 (A와 정반대)
- E 정기준: 동일 가중 벤치마크 / 격주 리밸런싱 / 전 종목 균등 (기준선)
- F 윤순환: 섹터 로테이션 / 격주 리밸런싱 / 2~3섹터 집중
- G 문여론: 뉴스 감성 기반 / 매일 리밸런싱 / 5~10종목 (감성 점수만 사용)
- H 박기술: 기술적 분석 / 매일 리밸런싱 / 5~8종목 (RSI, MACD, 볼린저 밴드 기반)
- I 최배당: 배당 투자 / 분기별 리밸런싱 / 5~10종목 (배당수익률 중심)
- J 한따라: 스마트머니 추종 / 매주 리밸런싱 / 5~8종목 (외국인/기관 수급 추종)
- K 로로캅: 글로벌 자산배분 로보어드바이저 / 매월 리밸런싱 / ETF 전용 4~8종목 (지수·섹터·해외·채권·배당 ETF 조합)
- M 오판단: 마켓 타이밍 / 매일 체크 / 3~10종목 (KOSPI 레짐 판단, 강세장 90%+투자 / 약세장 70%+현금)
- **UF 이상운**: C 옵션 한국 매크로 로테이션 추종 / 매일 체크 (회사 비중 변경 시 즉시 추종) / 18판(`KR2KRFACTR99NKI1`) 단일 추종, 17종목 중 옵션 Y 산식(`qty = round(시드×비중/가격)`, 비중 순 위에서부터 누적, 남은 현금 초과 시 컷)으로 매수 (2026-06-02 시점 14종목) / **KIS API로 실전 매매** / `scripts/core/portfolio_follow.py` + `com.investment.portfolio-follow` launchd 09:10 / 변경 없는 날은 매매 0건 (거래비용 최소화) / 휴장일·장외·킬스위치 가드 / 자세한 컨셉은 `portfolio/c_option_korea_macro_follow.md` (10번 섹션이 현재 룰)
- Q 정채원: **급락 반등 스캘핑 v2.1** (이슈 #60, 2026-05-18 백지 재설계 + OOS 검증) / 09:30~14:00 1분 간격 풀 199종목(KOSPI200 ∪ stock_universe) 1분봉 직접 평가 → **직전 5분 ≤ -2.5% AND 현재 분봉 양봉 ≥ +0.3%** 시그널 발견 즉시 시장가 매수 → **+2.5% 익절 / -1.5% 손절 / 30분 시간청산** / 1종목 집중 / 당일 재매수 금지 / 일일 매매 한도 8회 / 직전 3사이클 연속 손실 시 60분 쿨다운 / **bear 레짐 신규 진입 차단** / 매매당 max 1,000만원 캡 / 백테스트 18영업일 분할 검증(학습 12일 13건 61.5% +9.02% + 검증 6일 14건 57.1% +7.97%, 통합 27건 ≈+17% MDD -4.67%) — 표본 작아 실전 누적 검증 필요. v5(KOSPI200 정적 + vol/5MA≥3배 + post5 동적 + 트레일링)는 EDA에서 무알파 확인되어 폐기 (백업: `scripts/archive/q_monitor_v5.py`)

**아카이브 (2026-05-08 정리, 시뮬에서 제외)**:
- B 김균형: 균형 분산 / 매주 리밸런싱 / 10~15종목 분산 (E 정기준 동일가중과 컨셉 중복으로 정리)
- L 신장모: 분할매도 전략 / 매일 체크 / 3~8종목 코스닥 성장주 (성과 부진으로 정리)
- N 전몰빵: 집중투자 / 매주 리밸런싱 / 2~3종목 올인 (성과 부진으로 정리)
- O 정익절: 단기 스윙 수익실현 / 장중 10분 모니터링 / 5~8종목 (성과 부진, launchd unload)
- P 정삼절: 고정 시드 스윙 / 장중 10분 모니터링 / 5~8종목 (O와 매매 규칙 동일, 자본 운용 실험 종료, launchd unload)

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

# KIS API 테스트
python3 scripts/core/broker_client.py --test             # 삼성전자 현재가 조회
python3 scripts/core/broker_client.py --balance           # 예수금 조회
python3 scripts/core/broker_client.py --holdings          # 보유종목 조회

# 안전 장치
python3 scripts/core/safety.py --status                  # 킬스위치 상태
python3 scripts/core/safety.py --kill-switch on          # 킬스위치 활성화 (실전 매매 차단, Q 시뮬은 영향 없음)
python3 scripts/core/safety.py --kill-switch off         # 킬스위치 해제

# Q 정채원 급락 반등 스캘핑 v2.1 (09:30~14:00 진입, 풀 199 1분봉 직접 평가 → 직전 5분 ≤ -2.5% + 양봉 ≥ +0.3% 시그널 → +2.5/-1.5/30m 단순 청산)
python3 scripts/core/q_monitor.py              # 실행 (08:45 시작, 09:30 스캔 개시)
python3 scripts/core/q_monitor.py --dry-run     # 매매 없이 로그만

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
  - 뉴스 수집 → 11명 배분 결정 (A·C·D·E·F·G·H·I·J·K·M, Q는 q_monitor가 직접 매매) → 시뮬레이션(시가 체결) → 텔레그램 발송
- `scripts/reports/weekly_report.py` — 첫 영업일이면 지난주 성과 텔레그램 발송 (holidays 패키지로 공휴일 대응)
- `scripts/reports/monthly_report.py` — 월 첫 영업일이면 지난달 성과 텔레그램 발송 + Supabase 저장
- `scripts/reports/quarterly_report.py` — 분기 첫 영업일이면 지난 분기 성과 텔레그램 발송 + Supabase 저장
- 로그: `logs/pipeline/pipeline_YYYY-MM-DD.log`
- 환경변수: `.env`에 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` 필요

### O 정익절 / P 정삼절 장중 모니터링 (2026-05-14 실제 unload 완료)
- 2026-05-08 시뮬 제외 후에도 launchd에서 unload가 실행되지 않아 09:10에 매일 자동 실행되고 있었음. **2026-05-14 `launchctl unload` 실행하여 실제 정리 완료** (이전 09:10~10:10 동안 살아있던 PID 68537/68540 등 잔여 프로세스 kill).
- plist 파일은 보존 (`~/Library/LaunchAgents/com.investment.o-monitor.plist`, `com.investment.p-monitor.plist`) — 향후 재개 시 `launchctl load`로 부활 가능
- `scripts/core/o_monitor.py`, `scripts/core/p_monitor.py`, `scripts/cron/o_monitor_cron.sh`, `scripts/cron/p_monitor_cron.sh` 코드도 보존
- 향후 재개 시 `launchctl load` + `EXCLUDED_INVESTOR_IDS`에서 O/P 제거 + `web/data.ts`의 EXCLUDED 갱신 필요

### 오전 8:45 — Q 정채원 급락 반등 스캘핑 v2.1 (2026-05-18 백지 재설계, 이슈 #60)
- plist: `~/Library/LaunchAgents/com.investment.q-monitor.plist`
- `scripts/cron/q_monitor_cron.sh` → `scripts/core/q_monitor.py`
  - **09:30 ~ 14:00 진입 윈도우** (첫 스캔은 09:30:20부터 — 분봉 latency 회피), HOLDING은 최대 14:30까지 모니터링 (14:00 마지막 진입 + 30분)
  - 시그널 발견 즉시 시장가 매수 (당일 재매수 금지 가드)
  - 매수 후 현재가 체크 30초 간격 / IDLE 스캔 **분 경계 +20초 정렬** (KIS 분봉이 분 마감 후 ~수십초 뒤 입수되는 latency 회피) → **+2.5% 익절 / -1.5% 손절 / 30분 시간청산** (트레일링·post5_vol 모두 폐기)
  - 동시 보유 **1종목** (HOLDING 중에는 신규 스캔 스킵)
  - **종목 선정 v2.1 — 풀 199종목 1분봉 직접 평가**
    - 풀: KOSPI200 ∪ stock_universe = 199종목 (`build_pool()` 매 실행 시 결합, KIS 거래대금 상위 KOSDAQ 보강은 OOS 검증에서 독으로 확인되어 미적용). 2026-06-05 universe.csv의 code 컬럼 leading zero 손실 패치 — `.zfill(6)` 정규화로 KIS 호출 실패율 66% → 0%
    - 매분 풀 전 종목 1분봉 6개 (`FHKST03010230`) 동시 호출 (ThreadPool `SIGNAL_SCAN_WORKERS=4` + 0~50ms jitter)
    - 시그널: `prev_5m = (close[-1]/close[-6]-1)*100 ≤ -2.5%` AND `candle = (close[-1]-open[-1])/open[-1]*100 ≥ +0.3%`
    - **float precision 보정**: `ENTRY_THRESHOLD_EPSILON=1e-3` 마진 적용 — 표시상 임계 정확히 일치(+0.30%/-2.50%)하지만 부동소수점에서 0.2998xx로 계산되어 미달 처리되는 경계 1건을 살림 (2026-06-05 454910 케이스). 백테스트 영향 0건 확인
    - **near-miss 로깅**: prev_5m ≤ -2.0% OR candle ≥ +0.1%인 종목은 매스캔 상위 5건을 INFO로 기록 → 분포 진단/임계 튜닝 근거
    - **직전 스캔 실패 종목 우선 재시도**: KIS 500 에러 등으로 호출 실패한 종목을 다음 스캔에서 별도 worker(=2)로 먼저 시도 (공정성 확보, 시그널 누락 최소화)
    - 매치 종목 중 가장 큰 급락(prev_5m 최소) 선택
    - API 호출량: 약 199/분 (KIS 한도 1,200/분의 16%)
    - 스캔 요약 로그 포맷: `풀 N개 → 평가 K / 실패 M / 매치 X / near-miss Y (Ts)`
    - **임계 완화 검토 결과 (2026-06-05, `scripts/q_v2/11_threshold_relax.py`)**: prev_5m ∈ {-2.0, -2.5} × candle ∈ {off, +0.0, +0.1, +0.2, +0.3} 10조합 백테스트. v2.1 (-2.5/+0.3)이 통합 +11.21% / MDD -4.92% / win 50%로 1등, 나머지 9조합 모두 마이너스. 양봉 조건 폐기는 통합 -41% 재앙. **임계 완화 부정, v2.1 룰 유지**
    - **영업일 경계 패치 (2026-06-08, 캐시 31일 확장 후 발견)**: (1) `_evaluate_one`의 `bars.sort(key=time만)`이 전일 14:59("145900")를 오늘 09:30("093000")보다 뒤로 정렬해 recent6가 전일 마지막 6봉을 잡던 버그 — `(date, time)` 결합 정렬 + 오늘 분봉만 추출 후 6봉 검증으로 수정. (2) `08_robust.py` precompute도 같은 문제(`shift(5)`가 전일 마지막 close 참조)로 갭다운을 5분 폭락으로 오탐 — `groupby('date').shift(5)`로 수정. 영업일 첫 5분 분봉은 prev_5m NaN. 6/8 단독 시그널 173 → 9건(164건이 갭다운 가짜)
    - **확장 캐시 워크-포워드 (2026-06-08, 31거래일 4/21~6/8)**: 학습 12일 18실행 +4.29% / 검증 9일 26실행 +5.48% / **OOS 5/22~6/8 10일 28실행 승률 35.7% -8.57% MDD -11.87%** — v2.1 룰의 OOS 실패 확인. 통합 31일 72실행 +1.20%(break-even). q_monitor 영업일 경계 패치 후 1~2주 추가 누적 모니터링 → 폐기 결정 예정
    - **2026-06-09 패치 후 첫 실전일**: 3사이클 매매 (테크윙 +2.53% 익절 +115,350원 / LG이노텍 -1.36% 손절 -56,112원 / HPSP +2.62% 익절 +119,852원). **승률 66.7% / 일일 +3.30% / Net +150,882원**. 누적 시드 대비 -8.50% → -5.48%로 회복. 영업일 경계 버그가 실전 0건의 진짜 원인이었음 확인. 백테스트 OOS -8.57%와 다른 결과 — 표본 3건이라 우연 가능. 06-19까지 10영업일 더 누적 후 결정
    - **2026-06-10**: 1사이클 (F&F 383220 12:22→12:53 -1.27% **시간청산** -59,597원). 일일 -1.47% / 누적 -5.48% → -6.87% 재악화. **2일 누적 (06-09~06-10): 4사이클 2승 2패 / 승률 50% / Net +81,521원**. 백테스트 OOS 패턴(승률 35.7%)에 근접하는 신호 시작 — 폐기 기준(누적 < 0 또는 승률 < 45%)에 경계선. 06-19까지 8영업일 더 누적
    - **2026-06-11**: 1사이클 (주성엔지니어링 036930 12:03→12:18 **+2.55% 익절** 15분만에 +115,400원). 일일 +2.27% / Net +105,659원 / 누적 -6.87% → -4.75% 회복. **3일 누적 (06-09~06-11): 5사이클 3승 2패 / 승률 60% / Net +187,180원** — 승률 60%로 회복, 폐기 기준에서 멀어짐. **유지 쪽 무게**. 06-19까지 7영업일 더 누적
    - **2026-06-12**: 1사이클 (원익IPS 240810 10:20→10:26 **+2.46% 익절** 5.5분만에 +116,986원). 일일 +2.24% / 누적 -4.75% → -2.62% 회복 가속
    - **2026-06-15**: 0사이클. prev_5m 시그널 임계(-2.5% 이하) 24분봉 발생했으나 candle 분포 전부 음봉 → 진입 0건. **양봉 +0.3% 필터가 손실 회피로 정상 작동** (한국타이어 09:49 prev_5m -3.70%/candle -3.54%, HPSP 10:09~13 4분 연속 음봉 등). bull 레짐 + 변동성 high. **5일 누적 (06-09~06-15): 6사이클 4승 2패 / 승률 66.7% / Net +293,952원** / 시드 누적 -2.62% — 폐기 기준에서 안전. 06-19까지 4영업일 더 누적
    - **2026-06-16**: 0사이클 (이틀 연속). prev_5m -2.5% 충족 42분봉 발생(어제 24건보다 많음)했으나 candle 분포 가장 큰 양봉 +0.18%로 임계 -0.12%p 부족. 한화시스템 272210 09:37 prev_5m -2.81%/candle +0.18% 진입 직전이었으나 5분 뒤 -4.16%/-2.93% 가속 매도로 양봉 필터가 손실 회피 정확히 수행. **6일 누적 변동 없음**: 6사이클 4승 2패 승률 66.7% Net +293,952원. 06-19까지 3영업일 남음
    - **2026-06-17**: 1사이클 (후성 093370 10:03→10:05 **-1.59% 손절 2분만에** -77,142원). 일일 -1.79% / Net -87,176원 / 누적 -2.62% → -4.36% 재악화. 양봉 +0.3% 진입 직후 즉시 추가 하락한 케이스. **7일 누적 (06-09~06-17): 7사이클 4승 3패 / 승률 57.1% / Net +206,776원** — 승률 66.7% → 57.1% 하락(백테스트 OOS 35.7% 방향), 폐기 기준 안전. 06-19까지 2영업일 남음
    - **2026-06-18**: 1사이클 (SKC 011790 10:38→10:39 **-1.20% 손절 1분 10초만에** -56,462원). 이틀 연속 빠른 손절 (어제 2분, 오늘 1분). 일일 -1.39% / Net -66,231원 / 누적 -4.36% → **-5.69% 재악화**. **8일 누적 (06-09~06-18): 8사이클 4승 4패 / 승률 50% / Net +140,545원** — 승률 66.7% → 57.1% → 50% 연속 하락, 백테스트 학습/검증(50%) 수준 도달. 시드 대비 -5.69%로 폐기 기준 "누적 -5%" 해석 분기 (시드 절대값 기준이면 도달, 패치 후 v2.1 단독 기준이면 +3.07% 안전). 06-19 마지막 영업일 후 최종 결정
    - **2026-06-19 (9일 모니터링 종료)**: 0사이클 (prev_5m -2.5% 충족 8건, 양봉 동반 0건). **9일 누적 8사이클 4승 4패 / 승률 50% / Net +140,545원 / 시드 누적 -5.69%**. 폐기 기준 평가: 누적 흑자 + 승률 50% 안전 → **유지 결정**. -5% 트리거는 패치 후 v2.1 단독 기준(+3.07%) 적용. 익절 평균 +2.54% / 손절 평균 -1.42% 비대칭 OK. 승률 67→57→50% 연속 하락 추세는 OOS 방향이나 표본 8건 작아 추가 누적
    - **2026-06-22**: 2사이클 0승 2패 (LG전자 -1.82% 손절 11분 / 후성 -1.76% 손절 1분 36초). 일일 **-3.92%** (단일일 최악) / Net -185,069원 / 누적 -5.69% → **-9.39% 급락**. **10일 누적 (06-09~06-22): 10사이클 4승 6패 / 승률 40% / Net -44,524원 (적자 전환)** — 🔴 폐기 기준 두 개 동시 도달 (누적 < 0 + 승률 < 45%). 그러나 사용자 결정으로 **몇 개월 더 장기 관찰로 전환**. 폐기 기준 자체 일시 유보. v2.1 그대로 운영 지속
    - **2026-06-23**: 0사이클. prev_5m -2.5% 충족 14건 발생(어제 8건보다 증가)했으나 candle 양봉 ≥ +0.1% 동반 0건. 코오롱인더 011170 09:39 prev_5m -3.96%/candle -2.82%, 디케이락 069960 11:49 -3.47%/-3.08% 등 가속 매도만 발생. 11일 누적 변동 없음. **메모**: (1) 레짐 = "unknown"(06-22 KOSPI 폭락 후 market_regimes 갱신 안 됨, 자동 bear 차단 미작동). (2) 쿨다운은 같은 영업일 내에서만 평가 — 영업일 넘어가면 4연패 카운터 리셋되어 무력화, 의도된 동작인지 점검 가치 있음
    - **2026-06-24**: 1사이클 (두산로보틱스 454910 11:44→11:47 -1.87% 손절 2분 39초만에 -84,412원). 일일 -2.07% / Net -93,746원 / 누적 -9.39% → **-11.26%**. 06-05 ε 보정 도입 사례 종목이었으나 손절. **5연패 연속**
    - **2026-06-25**: 1사이클 (금호타이어 073240 12:11→12:16 -1.62% 손절 4분 39초만에 -72,000원). 일일 -1.83% / Net -81,166원 / 누적 **-12.88%**. **6연패 연속** (06-17·06-18·06-22×2·06-24·06-25). **13일 누적 (06-09~06-25): 12사이클 4승 8패 / 승률 33.3% / Net -219,436원** — 백테스트 OOS(35.7%)보다 더 낮은 승률 / 손절 종목 다양(LG전자·후성×2·SKC·두산로보틱스·금호타이어)으로 룰 자체 문제. 사용자 장기 관찰 결정 유지 중
    - **2026-06-26**: 1사이클 (금호타이어 073240 12:41→12:45 -1.93% 손절 4분 11초만에 -83,790원). **이틀 연속 금호타이어 손절** — 영업일 넘어가면 재매수 가드 무력화. 7연패 연속. 일일 -2.13% / Net -92,762원 / 누적 **-14.74%**
    - **2026-06-29**: 2사이클 2승 0패 (원익IPS 240810 09:32→09:54 **+2.82% 익절** 22분만 +119,907원 / 솔브레인 357780 11:34→12:04 +0.28% 시간청산 +11,947원 — 손실 없는 시간청산). 일일 **+2.67%** / Net +113,649원 / 누적 -14.74% → **-12.47% 회복**. **7연패 종료**, 6/11 이후 첫 흑자 영업일. **15일 누적 (06-09~06-29): 14사이클 6승 9패 / 승률 42.9% / Net -198,549원** — 승률 33→**42.9% 큰 폭 반등** (백테스트 학습/검증 50%에 근접). 운영 점검 누적: (1) 레짐 unknown 갱신 안 됨 / (2) 쿨다운 영업일 내 한정 / (3) **재매수 가드 영업일 내 한정** (금호타이어 06-25→06-26 반복)
  - **단순 청산** (트레일링/post5_vol 폐기):
    · 익절: 매수가 대비 +2.5% 도달 → 즉시 청산
    · 손절: 매수가 대비 -1.5% 도달 → 즉시 청산
    · 시간: 매수 후 30분 경과 → 시장가 청산
  - **레짐 게이트**: 시작 시 `market_regimes` 조회 → **bear 레짐 → 신규 진입 차단** (HOLDING 중이면 청산 후 종료)
  - **일일 매매 한도 8회**: BUY 8회 도달 시 추가 진입 차단 후 즉시 종료
  - **연패 쿨다운**: 직전 3사이클 모두 손실(<0%)이면 마지막 청산+60분 진입 차단 (재기동 시 transactions에서 복원)
  - 매매 발생 시 `daily_reports` + `portfolio_snapshots` 즉시 갱신
  - 자본: 시드 500만원 복리, 매매당 max 1,000만원 캡
  - 재기동 시 transactions에서 당일 거래 종목 + buy_count + 사이클 손익 자동 로드 → 재매수/한도/쿨다운 복원, 보유 종목의 `buy_at` 타임스탬프로 시간청산 카운트도 복원
  - **검증 (이슈 #60)**: 학습 12일 13건 승률 61.5% +9.02% / 검증 6일 14건 승률 57.1% +7.97% / 통합 27건 ≈+17% MDD -4.67%. 표본 작아 실전 1~2주 누적 검증 필요. 누적 손실 -5% 도달 시 즉시 중단 + 재검토.
- 로그: `logs/q_monitor/q_monitor_YYYY-MM-DD.log`

### 오전 9:10 — UF 이상운 C 옵션 한국 매크로 추종 (2026-05-22 시즌2 시작, 2026-06-02 옵션 Y 룰)
- plist: `~/Library/LaunchAgents/com.investment.portfolio-follow.plist`
- `scripts/cron/portfolio_follow_cron.sh` → `scripts/core/portfolio_follow.py`
  - BetterWealth FA 18판(`KR2KRFACTR99NKI1`) "한국 매크로 로테이션" 단일 비중 조회 (25판 추종 중단)
  - 시드 = KIS `total_asset`. 비중 큰 종목부터 정렬 → `qty = round(시드 × 비중% / 가격)` → 위에서부터 누적, 다음 종목 매수가 남은 현금 초과 시 그 종목에서 `floor(남은현금/가격)`만 사고 컷
  - `portfolio/last_target.json` (raw_weights 단일 dict) 캐시와 diff 비교 → **회사 비중 변경 시에만** KIS 시장가 매도/매수 (변경 없는 날 매매 0건)
  - 매도 먼저 (현금 확보) → 매수 순서
  - 매매 후 KIS `get_holdings`/`get_balance`로 실잔고 확인 → `portfolios.UF` + `transactions` + `rebalance_history` + `portfolio_snapshots` 갱신
  - 텔레그램 알림 (변경 감지·매매 실행·오류)
  - **가드**: 한국 휴장일 (holidays.KR) / 장 운영시간 09:10~14:30 / 킬스위치 (Meta Manager와 공유, ON이면 매매 차단)
  - dry-run / force 옵션은 킬스위치·게이트 우회
- 로그: `logs/portfolio_follow/portfolio_follow_YYYY-MM-DD.log`
- 코드 보존: `scripts/core/portfolio_follow.py`, `scripts/cron/portfolio_follow_cron.sh`
- 컨셉 문서: `portfolio/c_option_korea_macro_follow.md`

### 오후 3:35 — 스토리텔링 (종가 반영 + 코멘터리)
- plist: `~/Library/LaunchAgents/com.investment.storytelling.plist`
- `scripts/cron/storytelling_cron.sh` — Claude CLI로 스토리텔링 실행
  - 종가 반영 → 코멘터리 → 투자자 일기
- 로그: `logs/storytelling/storytelling_YYYY-MM-DD.log`

### launchd 관리 명령
```bash
# 전체 등록 (o/p-monitor는 2026-05-08 정리, meta는 2026-05-21 정리로 unload 유지)
launchctl load ~/Library/LaunchAgents/com.investment.pipeline.plist
launchctl load ~/Library/LaunchAgents/com.investment.q-monitor.plist
launchctl load ~/Library/LaunchAgents/com.investment.portfolio-follow.plist
launchctl load ~/Library/LaunchAgents/com.investment.storytelling.plist

# 전체 해제
launchctl unload ~/Library/LaunchAgents/com.investment.pipeline.plist
launchctl unload ~/Library/LaunchAgents/com.investment.q-monitor.plist
launchctl unload ~/Library/LaunchAgents/com.investment.portfolio-follow.plist
launchctl unload ~/Library/LaunchAgents/com.investment.storytelling.plist

# 상태 확인
launchctl list | grep com.investment
```

### Claude Code 자동 업데이트 비활성화
파이프라인 안정성을 위해 자동 업데이트를 끄고 수동으로 관리한다.
- 설정: `~/.claude/settings.json`에 `"env": {"DISABLE_AUTOUPDATER": "1"}` 추가
- 수동 업그레이드: `claude update` (주말 등 여유 있을 때 실행)
- 이 설정은 로컬 머신에만 적용됨

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
    portfolio.py         매수/매도/평가/리밸런싱/분할매도(L전용, 2026-05-08 정리로 비활성)
    simulate.py          일일 시뮬레이션 오케스트레이터 + 종가 업데이트
    daily_pipeline.py    뉴스/배분/스토리 저장 헬퍼
    event_detector.py    이벤트 감지 & 텔레그램 알림 (시뮬레이션 후 자동 호출)
    risk_manager.py      리스크 관리 (포지션 제한 검증 + 리스크 이벤트 감지/알림)
    run_backtest.py      백테스트 CLI 진입점
    backfill_regimes.py  과거 마켓 레짐 소급 계산
    broker_client.py     한국투자증권 KIS API 클라이언트 (인증/잔고/주문)
    meta_manager.py      메타 매니저 (2026-05-21 운영 비활성, 코드·텔레그램 알림 무력화. 코드와 DB 데이터는 보존)
    scorecard.py         전략 스코어카드 엔진 (Python 포트, 6카테고리 가중평균)
    safety.py            실전 투자 안전 장치 (손실 한도/킬스위치/긴급청산)
    o_monitor.py         O 정익절 장중 실시간 모니터링 (2026-05-08 정리, launchd unload — 코드 보존)
    p_monitor.py         P 정삼절 장중 실시간 모니터링 (2026-05-08 정리, launchd unload — 코드 보존)
    q_monitor.py         Q 정채원 급락 반등 스캘핑 v2.1 (이슈 #60, 09:30~14:00 진입, 풀 199 1분봉 직접 평가 → 직전 5분 ≤ -2.5% + 양봉 ≥ +0.3% 시그널 → +2.5/-1.5/30m 단순 청산, 일일 8회 한도/3연패 60분 쿨다운, bear 진입 차단, 분 경계 +20초 정렬·near-miss 로깅·실패 종목 우선 재시도·universe code 6자리 정규화·ε=1e-3 보정·(date,time) 결합 정렬+오늘 분봉 검증)
    portfolio_follow.py  UF 이상운 C 옵션 한국 매크로 추종 (2026-05-22 시즌2 시작, 2026-06-02 옵션 Y 룰: 18판 단일 + 비중 순 round 누적 + 컷, 회사 비중 변경 감지 시에만 KIS 자동 매매, 09:10 매일 실행, 휴장일·장외·킬스위치 가드)
    kospi200.py          KOSPI200 정적 종목 코드 리스트 (198개, q_monitor.py v2.1 풀 구성용, 6개월마다 수동 갱신)
  backtest/          # 백테스트 엔진 (인메모리, DB 비접근)
    engine.py            InMemoryPortfolio + run_backtest() 루프 (L 분할매도 + O 능동 트레이딩 근사 포함)
    strategies.py        15개 투자자별 결정론적 배분 함수 + O_PARAMS 파라미터 딕셔너리
    price_cache.py       yfinance 일괄 다운로드 + pickle 캐시 (prev_volume/sma_5 포함)
    metrics.py           Sharpe/MDD/변동성/승률 계산
    historical_indicators.py  캐시된 DataFrame에서 모멘텀/RSI/MACD 등 계산
  modules/           # 투자자별 데이터 분석 모듈
    momentum_data.py       모멘텀/수익률 (A, D용)
    sector_analysis.py     섹터별 성과 (F용)
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
    q_monitor_cron.sh        08:45 Q 정채원 스캘핑 (09:30~14:00 진입 윈도우)
    portfolio_follow_cron.sh 09:10 UF 이상운 C 옵션 매크로 추종
    storytelling_cron.sh     15:35 종가 반영 + 스토리텔링
```

**시즌 메타데이터 (`config.simulation`):**
- `current_season_id`: 현재 활성 시즌 (2026-05-22 기준 시즌2 → 2)
- `season1_start_date`: 2026-03-10
- `season2_start_date`: 2026-05-22
- `initial_capital`: 10,000,000 (시즌2 시드)
- 6개 테이블 (`transactions` / `portfolio_snapshots` / `daily_reports` / `allocations` / `rebalance_history` / `market_regimes`)에 `season_id INT DEFAULT 1` 컬럼. 모든 insert/upsert가 `supabase_client.get_current_season_id()`로 자동 주입. **Q 정채원은 시즌 무관**으로 `season_id=1` 명시 (자기 데이터). `daily_reports`는 (date) PK 공유이므로 그날의 메인 시즌으로 저장.

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
| `real_portfolio` | date | cash, holdings(jsonb), total_asset, daily_return_pct, cumulative_return_pct (TWR), kospi_cumulative_pct, alpha_cumulative_pct, net_deposit, cumulative_deposits | 실전 포트폴리오 스냅샷 (입출금 추적) |


**환경변수:**
- `/.env` — Python용 (`SUPABASE_URL`, `SUPABASE_KEY`, `KIS_APP_KEY`, `KIS_APP_SECRET_KEY`, `KIS_ACCOUNT_NO`)
- `/web/.env.local` — Next.js용 (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- Vercel 환경변수 — 위 Next.js용 + `KIS_APP_KEY`, `KIS_APP_SECRET_KEY`, `KIS_ACCOUNT_NO` (실전 투자 실시간 조회용)

## Key Conventions

- **시간대: 한국 표준시(KST, UTC+9) 기준.** 모든 날짜/시간 표기, 스케줄, 장 운영시간 판단은 KST 기준이다.
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

## Meta Manager (실전 투자) — 2026-05-21 운영 비활성

메타 매니저는 2026-05-21 사용자 결정으로 **전면 비활성**되었다.
- launchd plist + `meta_cron.sh` 삭제 / `daily_pipeline_cron.sh` 체이닝 제거
- `meta_manager.py` 내 `send_telegram`은 no-op 함수로 무력화 (텔레그램 알림 차단)
- 코드 본체(`meta_manager.py`, `safety.py`)와 DB 테이블(`meta_decisions`, `real_portfolio`)은 보존 — 향후 재개 시 사용
- web 대시보드 `/live` 페이지와 `/investors`의 메타 카드는 DB 데이터를 읽기만 하므로 그대로 표시됨 (과거 운영 흔적)

재개 절차는 별도 결정 필요. 재개 시점에 이 섹션을 다시 채워야 한다.

## Web Dashboard

**배포 URL**: https://investment-phi-six.vercel.app/ (시뮬 11명 + UF 이상운) / Q 운영 콘솔은 별도 Vercel 프로젝트 (`web-q/`)

레포는 두 개의 Next.js 앱을 포함한다.
- `web/` — 시뮬 11명(A·C·D·E·F·G·H·I·J·K·M) + UF 이상운(C 옵션 한국 매크로 추종, 시즌2부터) 대시보드. **Q 정채원과 B/L/N/O/P(2026-05-08 정리)는 표시되지 않는다.** 시즌2 데이터만 표시 (시즌1은 봉인).
- `web-q/` — Q 정채원 실시간 1분봉 시뮬 운영 콘솔 (KIS 시세·분봉 조회 전용, 별도 앱·별도 Vercel 프로젝트, 포트 4001).

`web/`에서 Q 제외는 `src/lib/data.ts`의 `EXCLUDED_INVESTOR_IDS`/`EXCLUDED_INVESTOR_NAMES` 상수가 단일 진실 공급원이다. `getConfig()`/`getDailyReport()`/`getAllDailyReports()`/`getDailyStories()` 등 핵심 함수가 결과에서 Q를 자동 제거하고 rankings를 1..n으로 재부여한다. 명시 분기(투자자 상세 Q 페이지, versus validIds, 종목 상세 스캘핑 뱃지 등)는 모두 제거됨.

**시즌 필터링**: `data.ts`의 `getCurrentSeasonId()` 헬퍼가 `config.simulation.current_season_id`를 모듈 캐시로 반환. 24개 query 지점이 6개 시즌 테이블에 `season_id` 필터를 적용한다. Q 관련 query는 시즌 필터를 우회 (`investor_id === "Q"` 분기). P 정삼절의 `getCashflowHistory`는 시즌1 명시.

`web/` — Next.js (TypeScript + Tailwind) 대시보드. 시뮬레이션 결과를 시각적으로 확인. Vercel로 배포.
- 메인(`/`): 투자자 순위(일일 수익률/수익금, 누적 수익률, 전일 대비 순위 변동), 오늘의 매매(매수/매도 테이블, 정렬), 주간 MVP/연승, 시장 현황(종목 검색+정렬), 뉴스
- 실전 투자(`/live`): 실전 포트폴리오 현황(총자산/일일수익률/KOSPI누적/알파), 보유종목(KIS 실시간 현재가), 운용 전략 요약(목표/리밸런싱/손절·익절/레짐별 투자 비중), 운용 현황(알파 달성 상태/운용 기간/시장 국면/MDD/승률), 자산 추이 차트(follow 구간 리베이스), 포트폴리오 현황, 메타 매니저 매매 히스토리(레짐/전략/주문 상세)
- 투자자 목록(`/investors`): 시뮬 11명 + 메타 매니저 카드 그리드, 순위/수익률 표시 (Q는 web-q/, B/L/N/O/P는 2026-05-08 정리로 제외)
- 투자자 상세(`/investors/[id]`): 카툰 아바타, 뱃지, 포트폴리오 차트, 자산 구성 변화(stacked area), 성과 기여도(종목별 바차트+섹터별 Treemap), 국면별 수익률(강세/중립/약세, 20일 미만 경고), 보유종목, 거래내역, 투자 방법론(대표인물/참고링크), G는 감성 점수 추이
- 리포트(`/reports`): 좌우 분할 마스터-디테일 레이아웃 (데스크탑: 왼쪽 달력+날짜목록 sticky | 오른쪽 코멘터리+투자자 현황(일일 수익률/수익금/총자산/누적)+일기+매매내역+뉴스, 모바일: 접기/펼치기 캘린더), 전일 대비 순위 변동 표시
- 종목 분석(`/stocks`): 섹터 히트맵, 섹터 비중, 국내주식(85개)/ETF(15개) 분리 목록, 종목 검색(debounce), 현재가/등락률/보유 정렬
- 종목 상세(`/stocks/[ticker]`): 가격 차트, ETF면 구성정보(섹터 비중+구성 종목), 보유 투자자, 거래내역
- 분석(`/analysis`): 전략 스코어카드(6개 카테고리 종합 평가, 실전 추천 뱃지, 백테스트 괴리율), 성과 지표(샤프/MDD/변동성/알파/승률), 국면별 성과(강세/중립/약세, 20일 미만 경고), 수익률 상관관계 히트맵, 포지션 겹침률, 종목 인기도, 성과 기여도 분석(투자자별 섹터 기여도 비교). 각 섹션마다 데이터 기반 전문가 인사이트 동적 생성(analysis-insights.ts)
- 대결(`/versus`): 추천 대결, 자유 선택, 주간 MVP/꼴찌, 연승 기록
- 대결 상세(`/versus/[matchup]`): 1:1 자산 비교, 일별 수익률 차이, 포지션 비교
- 리그(`/league`): 월간 시즌제 승점 순위(1위=15점~15위=1점), 누적 승점 추이 차트, 시즌 아카이브(클릭 시 과거 시즌 전체 순위표+승점 차트 표시)
- Supabase에서 데이터를 읽어 서버 컴포넌트에서 렌더링 (DB 직접 쿼리)
- Node 20+ 필요, 상세 내용은 `web/CLAUDE.md` 참조

```bash
cd web && pnpm dev      # 시뮬 대시보드 (localhost:4000)
cd web && pnpm build
cd web-q && pnpm dev    # Q 운영 콘솔 (localhost:4001)
cd web-q && pnpm build
```

### web-q/ 운영 콘솔 (Q 정채원 전용)

- **라우트**: `/` 메인(오늘 현황 — HOLDING/IDLE/장마감 배너 + 카운트다운 + 진입 후 분봉 차트 + 오늘 매매), `/history` 누적 기록(정채원 일기 타임라인 포함 — `daily_stories.diaries["정채원"]`), `/strategy` 전략 설명
- **API**: `GET /api/status`(상태+오늘 매매+요약), `GET /api/kis-price?ticker=XXXXXX`(현재가 프록시), `GET /api/kis-minute?ticker=XXXXXX&from=ISO`(매수 시각부터 현재까지의 1분봉, 1분 TTL 메모리 캐시, FHKST03010230)
- **폴링**: 장중 TTL 3분 / 장마감 후 TTL 10분 (`live-prices.tsx` 패턴 복제). HOLDING 카드의 강제청산 카운트다운만 1초 간격 클라이언트 차감 (네트워크 호출 없음). HOLDING 분봉 차트는 60초 간격 자체 폴링 + Y축에 -3% 손절선 / +4% 익절선 / 매수가 점선 항상 표시
- **인증**: 없음 (공개)
- **KIS 토큰**: Supabase `config.kis_token`에서 **읽기만**. 토큰 발급은 `broker_client.py`만 담당 (1일 1회 원칙)
- **환경변수** (`web-q/.env.local` + Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KIS_APP_KEY`, `KIS_APP_SECRET_KEY`, `KIS_ACCOUNT_NO` (web/와 동일 값)

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

#### Step 2: 투자자별 배분 결정 (11개 독립 AI 에이전트 병렬 실행, B/L/N/O/P/Q 제외)
- `notify("🧠 Step 2: 투자자별 배분 결정 시작 (11명 병렬)")`
**반드시 11개의 서브에이전트(Agent tool)를 동시에 병렬 실행** (A·C·D·E·F·G·H·I·J·K·M; B/L/N/O/P는 2026-05-08 정리, Q는 q_monitor 직접 매매)하여 각 투자자의 배분을 독립적으로 결정한다.
- 각 에이전트는 자기 투자자의 프로필 + 뉴스만 전달받고, 다른 투자자의 판단을 알 수 없음
- 에이전트에게 전달할 정보: 투자자 프로필 JSON 내용, 뉴스 내용, stock_universe 목록, 현재 포트폴리오 상태
- A 에이전트에는 추가로 `scripts/modules/momentum_data.py`의 `get_momentum_data()` 결과를 전달 (모멘텀 상위 종목 집중)
- C 에이전트에는 추가로 `scripts/modules/quality_metrics.py`의 `get_quality_metrics()` + `scripts/modules/dividend_data.py`의 `get_dividend_data()` 결과를 전달 (안정성 + 배당)
- D 에이전트에는 추가로 `scripts/modules/momentum_data.py`의 `get_momentum_data()` 결과를 전달 (낙폭 과대 종목 집중)
- F 에이전트에는 추가로 `scripts/modules/sector_analysis.py`의 `get_sector_analysis()` 결과를 전달 (상위 섹터 집중)
- H 에이전트에는 추가로 `scripts/modules/technical_indicators.py`의 `get_technical_signals()` 결과를 전달
- I 에이전트에는 추가로 `scripts/modules/dividend_data.py`의 `get_dividend_data()` 결과를 전달
- J 에이전트에는 뉴스 중 외국인/기관 수급 관련 내용을 강조하여 전달
- K 에이전트에는 추가로 `scripts/modules/asset_allocation.py`의 `get_asset_allocation_data()` 결과를 전달 (ETF 카테고리별 수익률/변동성/추세 데이터)
- M 에이전트에는 추가로 `scripts/modules/market_regime.py`의 `get_market_regime()` 결과를 전달. 레짐에 따라 allocation 합계를 조절: bull→0.9, neutral→0.5, bear→0.3 (나머지는 현금)
- 에이전트는 분석 후 `save_allocation()`으로 Supabase에 저장
- rationale(배분 근거) 텍스트는 논점별로 줄바꿈(`\n`) 삽입하여 가독성 확보
- allocation 합계 ≤ 1.0 (M 오판단은 현금비중만큼 합계 < 1.0), stock_universe 종목만 사용
- A (공격적 모멘텀): 모멘텀/테마주 집중, 5~8종목
- C (보수적 우량주): 대형주/배당주 위주, 5~10종목
- D (역발상 투자): 최근 하락 종목 매수, 과열 종목 매도, 5~8종목
- E (동일 가중 벤치마크): 전 종목 동일 비중(1/N), AI 판단 없이 기계적 균등 분배
- F (섹터 로테이션): 유망 섹터 2~3개 선별 후 섹터 내 종목 집중, 섹터당 2~3종목
- G (뉴스 감성 기반): 뉴스 긍정/부정 감성 점수로만 비중 결정, 5~10종목. `save_allocation()` 호출 시 `sentiment_scores` 인자로 종목별 감성 점수 전달 (강한 긍정 +0.8~+1.0 / 긍정 +0.3~+0.7 / 중립 -0.2~+0.2 / 부정 -0.3~-0.7 / 강한 부정 -0.8~-1.0)
- H (기술적 분석): RSI 과매도 매수, 과매수 회피, MACD 골든크로스 우선, 5~8종목
- I (배당 투자): 배당수익률 상위 종목 집중, 재무 안정성 고려, 5~10종목
- J (스마트머니 추종): 뉴스에서 외국인/기관 순매수 동향 파악, 수급 양호 종목, 5~8종목
- K (글로벌 자산배분): **ETF 종목만 사용**, 지수/섹터/해외/채권/배당 ETF 카테고리별 비중 조절, 4~8종목. 주식ETF↔채권ETF 시소 원리 적용 (변동성 높을 때 채권 비중 확대)
- M (마켓 타이밍): 레짐에 따라 현금비중 조절. **allocation 합계 = 1.0 - 현금비중** (bull: 0.9, neutral: 0.5, bear: 0.3). 3~10종목
- **B/L/N/O/P (2026-05-08 정리): allocation 결정 단계 제외**. 서브에이전트 만들지 않음. `scripts/core/portfolio.py`의 `EXCLUDED_INVESTOR_IDS`가 단일 진실 공급원이며, `get_all_investors()`가 자동으로 제외한다.
- **Q (급락 반등 스캘핑 v2.1): allocation 결정 단계 제외**. Claude 에이전트 만들지 않음 (Q는 q_monitor.py가 풀 199 1분봉 직접 평가로 09:30~14:00 직전 5분 ≤ -2.5% + 양봉 ≥ +0.3% 시그널 매수 + +2.5/-1.5/30m 청산을 직접 수행). simulate.py도 Q allocation이 None이면 자동 스킵.

- `notify("✅ Step 2 완료: 11명 배분 결정 저장 (Q는 q_monitor가 별도 실행, B/L/N/O/P 정리)")`

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
※ B 김균형 / L 신장모 / N 전몰빵 / O 정익절 / P 정삼절은 2026-05-08 정리로 일기 작성 대상에서 제외
- A 강돌진: 자신감 넘치는 공격적 ("확신한다", "올인했다")
- C 이든든: 보수적이고 신중한 ("급할 것 없다", "안정적으로 유지")
- D 장반대: 역발상적 ("모두가 팔 때 샀다", "시장이 틀렸다")
- E 정기준: 기계적, 무감정 ("규칙대로 균등 분배", "감정 개입 없음")
- F 윤순환: 섹터 전문가 ("이번 주기에는 바이오가 유망하다")
- G 문여론: 뉴스/여론 민감 ("기사 톤이 긍정적이었다")
- H 박기술: 차트 분석가 ("차트가 말해주고 있다", "RSI가 과매도 구간이다")
- I 최배당: 배당 투자자 ("배당이 핵심이다", "꾸준한 현금흐름이 중요하다")
- J 한따라: 수급 추종자 ("외국인이 사는 이유가 있다", "기관 자금이 몰리고 있다")
- K 로로캅: 알고리즘식, 무감정 ("데이터가 말해준다", "최적 비중으로 재조정", "모델이 지시한 대로 실행")
- M 오판단: 냉정한 타이머 ("지금은 쉴 때다", "시장이 부를 때만 들어간다", "이평선이 말해주고 있다")
- Q 정채원: 빠르고 단호한 스캘퍼, 결단력 있는 톤 ("11시 10분에 5분 -2.8% 떨어진 거 양봉 전환 보고 잡았다", "30분 안에 +2.5% 닿아서 익절 던졌다", "-1.5% 손절 칼같이 끊었다", "30분 지나서 +0.4%로 시간청산했다", "오늘은 09:30~14:00 동안 시그널 0건이라 관망", "3연패 떠서 1시간 쉰다")
- 메타: 실전 운용자 톤, 담백·수치 중심·1인칭 ("오늘은 A 강돌진 배분을 그대로 추종했다", "체결가 평균 슬리피지 0.04%", "KOSPI 대비 알파 +1.0%p로 확대됐다"). 자금/체결/알파 관점으로만 작성하고 시뮬 투자자 톤(확신·역발상·차트 운운)은 차용 금지

**Q 정채원 일기 작성 규칙** (별도 절차, 12명 일기 중 하나)
- 데이터 소스: `transactions` 오늘 레코드(investor_id="Q") + 종가 정산 후 `daily_reports.investor_details["정채원"]`
- 반드시 반영해야 할 사실:
  - 오늘 매매 횟수(매수~청산 사이클 수) / 익절·손절·강제청산(매수+30분) 결과
  - 매매가 0회면 "거래량 폭증 후보 없어서 관망" 톤으로 표현
  - 일일 수익률(전일 대비) + 누적 수익률
- 분량: 2~3문장, 줄바꿈(`\n`) 포함

**메타 매니저 일기**: 2026-05-21 메타 매니저 운영 비활성으로 **작성 대상에서 제외**. diaries에 "메타" 키를 넣지 않는다.

**저장**: `scripts/core/daily_pipeline.py`의 `save_stories(date_str, commentary, diaries)` 호출
- `diaries`는 `{"강돌진": "일기 내용...", "이든든": "...", ..., "정채원": "..."}` 형태 (시뮬 11명 이름 + "정채원" 키 = 총 12개 키, 메타 제외)
- `notify("✅ *Part B 완료* ({date}) — 코멘터리 & 투자자 일기가 저장되었습니다.")`

### 주의사항
- 리밸런싱 due가 아닌 투자자는 allocation이 있어도 매매 스킵
- A/G/H/M은 매일, D는 3영업일마다, J는 7영업일마다, E/F는 14영업일마다, C/K는 30영업일마다, I는 90영업일마다만 실행 (holidays.KR 기반 휴장일 제외). Q는 allocation 단계 제외 (q_monitor가 직접 매매). B/L/N/O/P는 2026-05-08 정리로 제외
- 첫날은 `last_rebalanced: null`이므로 모두 실행
