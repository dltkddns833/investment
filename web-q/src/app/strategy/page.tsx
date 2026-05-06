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
        <h2 className="text-base font-bold">운영 규칙 (v3 — 2026-05-06~)</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <Rule label="스캔 시간" value="10:00 ~ 14:50 (1분 간격)" />
          <Rule label="동시 보유" value="1종목" />
          <Rule label="진입 조건" value="등락률 ≥ +7%" />
          <Rule label="가격 필터" value="전일 종가 ≥ 2,000원" />
          <Rule
            label="거래량 필터"
            value="직전 15분 거래량 ≥ 전일 동시간대 ×4 (없으면 ×3 fallback)"
          />
          <Rule
            label="레짐 게이트 (v3)"
            value="bear → 신규 진입 차단 / bull_score ≤ 2 → 임계 ×2 (등락률 +14%, 거래량 8배/6배)"
          />
          <Rule
            label="익절 (v3)"
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
            <strong>bear → 신규 진입 차단</strong> /{" "}
            <strong>bull_score ≤ 2 → 임계 ×2</strong> 자동 적용 (v3)
          </li>
          <li>
            <span className="text-gray-400 font-medium">②</span> 등락률 순위 조회
            (KIS <code className="text-xs">FHPST01700000</code>)에서 ≥ +7% 종목 선별
          </li>
          <li>
            <span className="text-gray-400 font-medium">③</span> 전일 종가 ≥ 2,000원
            가격 필터 통과
          </li>
          <li>
            <span className="text-gray-400 font-medium">④</span> 직전 15분 거래량 / 전일
            동시간대 비율 (KIS <code className="text-xs">FHKST03010230</code>) ≥ 4배
            우선, 후보 없으면 ≥ 3배까지 확장 (9시대는 분봉 비교 불가하여 진입 안 함)
          </li>
          <li>
            <span className="text-gray-400 font-medium">⑤</span> 1순위 종목 시장가 즉시
            매수 → 매수+30분 30초 간격 가격 모니터링 → -3% 손절 / 트레일링(+3% 활성화 후
            고점 대비 -1%p 되돌림, v3) 익절 / 30분 강제청산
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
