export const dynamic = "force-dynamic";

export default function StrategyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">전략</h1>
        <p className="text-sm text-gray-500 mt-1">
          거래량 폭증 매집 추종 스캘핑
        </p>
      </div>

      <section className="glass-card p-5 md:p-6 space-y-4">
        <h2 className="text-base font-bold">운영 규칙 (v4 — 2026-05-08~)</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <Rule label="스캔 시간" value="10:00 ~ 14:50 (1분 간격)" />
          <Rule label="동시 보유" value="1종목" />
          <Rule
            label="1차 narrow"
            value="직전 분 대비 등락률 점프 ≥ +2%p (cold start: 등락률 ≥ +2% 전 종목)"
          />
          <Rule label="가격 필터" value="전일 종가 ≥ 2,000원" />
          <Rule
            label="등락률 상한"
            value="현재 등락률 ≤ +15% (고속 락 종목 회피)"
          />
          <Rule
            label="2차 confirm — 거래량"
            value="직전 1분 거래량 / 직전 5분 평균 ≥ 3배"
          />
          <Rule
            label="2차 confirm — 가격"
            value="직전 1분 등락 ≥ +2%"
          />
          <Rule
            label="휴면 차단"
            value="직전 5분 평균 거래량 < 1,000주 무시"
          />
          <Rule
            label="레짐 게이트"
            value="bear → 신규 진입 차단 (v3 약세 ×2 multiplier 폐기)"
          />
          <Rule
            label="익절"
            value="트레일링 +3% 활성화 → 고점 대비 -1%p 되돌림 시 청산"
          />
          <Rule label="손절" value="-3% (즉시 청산)" />
          <Rule label="강제 청산" value="매수 + 30분 (익절/손절 미발동 시)" />
          <Rule label="일일 매매 한도" value="8회 (도달 시 추가 진입 차단)" />
          <Rule
            label="연패 쿨다운"
            value="3사이클 연속 손실 → 60분 진입 차단"
          />
          <Rule label="당일 재매수" value="금지 (1회 청산 후 다른 종목으로)" />
          <Rule label="자본" value="시드 500만원 복리, 매매당 max 1,000만원 캡" />
          <Rule
            label="종목 범위"
            value="stock_universe 무관, KOSPI / KOSDAQ 전체"
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
            <span className="text-gray-400 font-medium">②</span> 매분 KIS 등락률 순위
            (<code className="text-xs">FHPST01700000</code>) 호출 → 직전 분 캐시와 비교해
            <strong> 등락률 점프 ≥ +2%p</strong> 종목만 후보로 추림 (보통 0~3개,
            cold start는 등락률 ≥ +2% 전 종목 폴백)
          </li>
          <li>
            <span className="text-gray-400 font-medium">③</span> 가드: 현재 등락률 ≤ +15%,
            전일 종가 ≥ 2,000원
          </li>
          <li>
            <span className="text-gray-400 font-medium">④</span> 후보 종목만 1분봉 6개
            (<code className="text-xs">FHKST03010230</code>) 호출 →{" "}
            <strong>직전 1분 vol / 직전 5분 평균 ≥ 3배</strong> AND{" "}
            <strong>직전 1분 등락 ≥ +2%</strong> 동시 충족 (직전 5분 평균 vol &lt; 1,000주는
            휴면 종목으로 무시)
          </li>
          <li>
            <span className="text-gray-400 font-medium">⑤</span> 시그널 강도(vol_ratio)
            1순위 종목 시장가 즉시 매수 → 매수+30분 30초 간격 가격 모니터링 → -3% 손절 /
            트레일링(+3% 활성화 후 고점 대비 -1%p 되돌림) 익절 / 30분 강제청산
          </li>
          <li>
            <span className="text-gray-400 font-medium">⑥</span> 청산 후 사이클 결과 기록
            → 직전 3사이클 모두 음수면 60분 진입 차단 / 일일 BUY 8회 도달 시 즉시 종료
          </li>
        </ol>
      </section>

      <section className="glass-card p-5 md:p-6 space-y-3">
        <h2 className="text-base font-bold">변경 이력</h2>
        <div className="space-y-3 text-sm">
          <Change
            date="2026-05-08~"
            title="v4 — 초단기 시그널 전환 (점프 감지 + 1분봉)"
            desc="5/8 4종목(진원생명과학·계양전기우·현대오토에버 등) 급등 직전 1분봉 분석에서 결정적 진입점이 모두 '직전 1분 vol/5MA ≥3배 + 1분 등락 ≥+2%' 패턴이었음을 확인. v3의 15분/전일 비교는 폭발 직전 5MA가 부풀려져 둔감해지는 한계 발견. v3 게이트(등락률 ≥+7% + 15분/전일 ≥4배) 폐기, 매분 등락률 순위 점프 감지(직전 분 대비 ≥+2%p)로 후보 0~3개 추린 뒤 1분봉 시그널로 confirm. 가드: 등락률 ≤+15% (고속 락 회피), 5MA vol ≥1,000주 (휴면 차단). 약세 ×2 multiplier 폐기 — 단기 시그널 자체가 강한 필터."
          />
          <Change
            date="2026-05-06~"
            title="v3 — 트레일링 +3% / bear 진입 차단"
            desc="5/4·5/6 14건 백테스트(KIS 1분봉 + 540 grid search) 반영. 트레일링 활성선 +5%→+3% (peak 분포 평균 +2.6%로 +5%는 사실상 사문화, 시뮬 +124k 개선). 약세 게이트 분기 — bear 레짐은 신규 진입 자체 차단(5/6 약세 휩쏘 4/6 손실 회피), bull_score ≤ 2 (neutral/bull)는 임계 ×1.5→×2로 강화 (등락률 +14%, 거래량 8배/6배)."
          />
          <Change
            date="2026-04-30~"
            title="v2 — 임계 강화 + 안전장치 추가"
            desc="04-30 운영 1차 데이터(승률 25%, 손실 -7.14%) 반영. 등락률 5%→7%, 거래량 3/2배→4/3배 상향. 9시대 fallback 폐기(0승 2패). 익절 +4%→트레일링(+5% 활성→-1% 되돌림). 일일 8회 한도, 3연패 60분 쿨다운, 약세 레짐 임계 1.5배 게이트 신설."
          />
          <Change
            date="2026-04-29 ~ 2026-04-30"
            title="거래량 폭증 매집 추종 v1"
            desc="1분 상시 스캔에 거래량 ≥3배 + 등락률 ≥+5% 필터를 결합. 9시대는 분봉 비교가 불가능해 누적 거래량 1위로 fallback. 1일 운영 후 v2로 강화."
          />
          <Change
            date="2026-04-15 ~ 2026-04-28"
            title="1분 상시 스캔 스캘핑"
            desc="기존 7세션 정해진 시각 매매를 폐기하고 09:00~14:50 1분 간격 상시 스캔으로 전환. 매수+30분 강제 청산 규칙 도입."
          />
          <Change
            date="~2026-04-14"
            title="7세션 정해진 시각 스캘핑"
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
