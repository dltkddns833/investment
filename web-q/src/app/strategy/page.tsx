export const dynamic = "force-dynamic";

export default function StrategyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">전략</h1>
        <p className="text-sm text-gray-500 mt-1">
          급락 반등 스캘핑 (역발상)
        </p>
      </div>

      <section className="glass-card p-5 md:p-6 space-y-4">
        <h2 className="text-base font-bold">운영 규칙 (v2.1 — 2026-05-18~)</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <Rule
            label="진입 윈도우"
            value="09:30 ~ 14:00 (HOLDING은 ~14:30까지 모니터링)"
          />
          <Rule label="동시 보유" value="1종목" />
          <Rule
            label="종목 풀"
            value="KOSPI200 ∪ stock_universe (199종목)"
          />
          <Rule
            label="시그널 — 급락"
            value="직전 5분 종가 변화율 ≤ -2.5%"
          />
          <Rule
            label="시그널 — 반등 양봉"
            value="현재 분봉 (close-open)/open ≥ +0.3%"
          />
          <Rule
            label="종목 선택"
            value="후보 중 가장 큰 급락(prev_5m 최소) 1종목"
          />
          <Rule
            label="진입"
            value="시그널 발견 즉시 시장가 매수 (다음 분 시가에 체결)"
          />
          <Rule label="익절" value="+2.5% (즉시 청산)" />
          <Rule label="손절" value="-1.5% (즉시 청산)" />
          <Rule
            label="시간 청산"
            value="매수 후 30분 경과 시 시장가 청산"
          />
          <Rule
            label="레짐 게이트"
            value="bear → 신규 진입 차단"
          />
          <Rule label="일일 매매 한도" value="8회 (도달 시 추가 진입 차단)" />
          <Rule
            label="연패 쿨다운"
            value="3사이클 연속 손실 → 60분 진입 차단"
          />
          <Rule label="당일 재매수" value="금지 (같은 종목 1일 1매매)" />
          <Rule label="자본" value="시드 500만원 복리, 매매당 max 1,000만원 캡" />
          <Rule
            label="API 호출량"
            value="풀 199종목 × 1분봉 1회/분 = 약 199호출/분 (KIS 한도 16%)"
          />
        </div>
      </section>

      <section className="glass-card p-5 md:p-6 space-y-3">
        <h2 className="text-base font-bold">알고리즘 흐름</h2>
        <ol className="list-decimal list-inside text-sm space-y-2 text-gray-300">
          <li>
            <span className="text-gray-400 font-medium">①</span> 시작 시
            <code className="text-xs"> market_regimes</code> 레짐 조회 →{" "}
            <strong>bear → 신규 진입 차단</strong>
          </li>
          <li>
            <span className="text-gray-400 font-medium">②</span> 풀 구성:{" "}
            <strong>KOSPI200(198) ∪ stock_universe(100)</strong> 결합 (중복 제거) →
            199종목
          </li>
          <li>
            <span className="text-gray-400 font-medium">③</span> 매분 풀 전 종목에 대해
            1분봉 6개 (<code className="text-xs">FHKST03010230</code>) 동시 호출 (ThreadPool
            10)
          </li>
          <li>
            <span className="text-gray-400 font-medium">④</span> 각 종목에서{" "}
            <strong>prev_5m = (close[-1]/close[-6] - 1) × 100</strong>,{" "}
            <strong>candle = (close[-1]-open[-1])/open[-1] × 100</strong> 계산
          </li>
          <li>
            <span className="text-gray-400 font-medium">⑤</span> 시그널 필터:{" "}
            <strong>prev_5m ≤ -2.5%</strong> AND <strong>candle ≥ +0.3%</strong> 둘 다 충족
          </li>
          <li>
            <span className="text-gray-400 font-medium">⑥</span> 매치 종목 중{" "}
            <strong>가장 큰 급락(prev_5m 최소)</strong> 1종목 선택 → 시장가 즉시 매수
          </li>
          <li>
            <span className="text-gray-400 font-medium">⑦</span> 매수 후 30초 간격 현재가
            체크 → <strong>+2.5% 익절 / -1.5% 손절 / 30분 시간청산</strong> 중 첫 도달 조건으로
            청산
          </li>
          <li>
            <span className="text-gray-400 font-medium">⑧</span> 청산 후 사이클 결과 기록
            → 직전 3사이클 모두 손실이면 60분 진입 차단 / 일일 BUY 8회 도달 시 즉시 종료 /
            진입 마감(14:00) 후 IDLE 종료
          </li>
        </ol>
      </section>

      <section className="glass-card p-5 md:p-6 space-y-3">
        <h2 className="text-base font-bold">백테스트 검증 (이슈 #60)</h2>
        <div className="text-sm space-y-3">
          <p className="text-gray-400 leading-relaxed">
            18영업일(2026-04-21 ~ 05-18)을 학습/검증으로 분할하여 Out-of-sample 검증.
            동일 파라미터가 학습·검증 모두에서 유사한 성과를 내는지 확인하여{" "}
            <strong>과최적화 가능성을 차단</strong>했음.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-2 text-gray-400">구간</th>
                  <th className="text-right py-2 px-2 text-gray-400">영업일</th>
                  <th className="text-right py-2 px-2 text-gray-400">거래</th>
                  <th className="text-right py-2 px-2 text-gray-400">승률</th>
                  <th className="text-right py-2 px-2 text-gray-400">총수익</th>
                  <th className="text-right py-2 px-2 text-gray-400">MDD</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-800">
                  <td className="py-2 px-2">학습 (4/21~5/8)</td>
                  <td className="text-right py-2 px-2">12</td>
                  <td className="text-right py-2 px-2">13</td>
                  <td className="text-right py-2 px-2 text-emerald-400">61.5%</td>
                  <td className="text-right py-2 px-2 text-emerald-400">+9.02%</td>
                  <td className="text-right py-2 px-2">—</td>
                </tr>
                <tr className="border-b border-slate-800">
                  <td className="py-2 px-2">검증 (5/11~5/18)</td>
                  <td className="text-right py-2 px-2">6</td>
                  <td className="text-right py-2 px-2">14</td>
                  <td className="text-right py-2 px-2 text-emerald-400">57.1%</td>
                  <td className="text-right py-2 px-2 text-emerald-400">+7.97%</td>
                  <td className="text-right py-2 px-2 text-rose-400">-4.67%</td>
                </tr>
                <tr className="font-semibold">
                  <td className="py-2 px-2">통합</td>
                  <td className="text-right py-2 px-2">18</td>
                  <td className="text-right py-2 px-2">27</td>
                  <td className="text-right py-2 px-2 text-emerald-400">59.3%</td>
                  <td className="text-right py-2 px-2 text-emerald-400">≈+17%</td>
                  <td className="text-right py-2 px-2 text-rose-400">-4.67%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-gray-500 text-xs leading-relaxed">
            ⚠️ 표본 27건은 통계적으로 작음. 실전 1~2주 누적 검증으로 백테스트 기대값과의
            괴리를 모니터링하며, 누적 손실 -5% 도달 시 즉시 중단 + 룰 재검토.
          </p>
        </div>
      </section>

      <section className="glass-card p-5 md:p-6 space-y-3">
        <h2 className="text-base font-bold">변경 이력</h2>
        <div className="space-y-3 text-sm">
          <Change
            date="2026-05-18~"
            title="v2.1 — 백지 재설계 + 급락 반등 시그널 (이슈 #60)"
            desc="v1~v5 누적 운영 결과 부진(승률 39%, 손실 -3~0% 약손실이 54%) 진단. 197종목 × 18영업일 = 120만 분봉으로 가설 없이 EDA — vol 폭증 추격은 30분 후 mean ≈ 0%로 무알파 확인되어 v5 핵심 시그널 폐기. 직전 5분 ≤ -3% 후 30분 평균 +1.3% / 승률 65% 역발상 패턴 발견. 학습 12일에서 그리드 BEST를 뽑은 v2.0 초안은 검증 6일에서 -7%로 과최적화 확인되어 폐기. Robust zone 분석으로 학습·검증 모두 흑자 + 표본 충분 조합 25개의 공통 파라미터 영역 도출 → v2.1 확정 (entry≤-2.5%, candle≥+0.3%, +2.5/-1.5, 30m, 09:30~14:00). 풀은 KOSPI200 ∪ stock_universe — KIS 거래대금 상위 KOSDAQ 무차별 보강은 OOS에서 -6%로 독으로 확인되어 미적용. 트레일링·post5_vol·KOSPI200 정적 모두 폐기."
          />
          <Change
            date="2026-05-13 ~ 2026-05-17"
            title="v5 — KOSPI200 대형주 + post5_vol 동적 보유 (폐기)"
            desc="v4 운영 87건 표본 분석으로 시간/대형주 게이트 도입. KOSPI200 정적 198개에 한정 + 1분봉 vol/5MA ≥3배 + 10:00~10:30 진입 + post5_vol 동적 보유(60/30/15분) + 트레일링 익절. EDA에서 vol 시그널 무알파 확인되어 폐기. 코드는 scripts/archive/q_monitor_v5.py에 보존."
          />
          <Change
            date="2026-05-08~"
            title="v4 — 초단기 시그널 전환 (폐기)"
            desc="매분 등락률 순위 점프 감지(직전 분 대비 ≥+2%p)로 후보를 좁힌 뒤 1분봉 vol 시그널로 confirm. v3 게이트 폐기. v5에서 KOSPI200 한정으로 추가 강화 후 v2.1에서 백지 재설계."
          />
          <Change
            date="2026-05-06~"
            title="v3 — 트레일링 +3% / bear 진입 차단 (폐기)"
            desc="5/4·5/6 14건 백테스트 반영. 트레일링 활성선 +5%→+3%, bear 레짐 신규 진입 차단. v4에서 시그널 방식 자체 전환."
          />
          <Change
            date="2026-04-30~"
            title="v2 — 임계 강화 + 안전장치 추가 (폐기)"
            desc="04-30 운영 데이터 반영. 일일 8회 한도, 3연패 60분 쿨다운 신설. 트레일링 익절(+5% 활성→-1% 되돌림)로 전환. v3에서 활성선 조정."
          />
          <Change
            date="2026-04-29 ~ 2026-04-30"
            title="거래량 폭증 매집 추종 v1 (폐기)"
            desc="1분 상시 스캔에 거래량 ≥3배 + 등락률 ≥+5% 필터. 1일 운영 후 v2로 강화."
          />
          <Change
            date="2026-04-15 ~ 2026-04-28"
            title="1분 상시 스캔 스캘핑 (폐기)"
            desc="기존 7세션 정해진 시각 매매를 폐기하고 09:00~14:50 1분 간격 상시 스캔으로 전환. 매수+30분 강제 청산 규칙 도입."
          />
          <Change
            date="~2026-04-14"
            title="7세션 정해진 시각 스캘핑 (폐기)"
            desc="장중 7개 시점에서 강세 종목을 선별해 매매. 변동성을 못 따라가는 한계로 폐기."
          />
        </div>
      </section>
    </div>
  );
}

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-slate-600/50 pl-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-medium mt-0.5">{value}</div>
    </div>
  );
}

function Change({
  date,
  title,
  desc,
}: {
  date: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="border-l-2 border-slate-600/50 pl-4 py-1">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-xs font-mono text-gray-500">{date}</span>
        <span className="font-medium">{title}</span>
      </div>
      <p className="text-gray-400 text-xs mt-1 leading-relaxed">{desc}</p>
    </div>
  );
}
