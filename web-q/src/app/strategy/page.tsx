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
        <h2 className="text-base font-bold">운영 규칙</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <Rule label="스캔 시간" value="09:00 ~ 14:50 (1분 간격)" />
          <Rule label="동시 보유" value="1종목" />
          <Rule label="진입 조건" value="등락률 ≥ +5%" />
          <Rule label="가격 필터" value="전일 종가 ≥ 2,000원" />
          <Rule
            label="거래량 필터 (10시 이후)"
            value="직전 15분 거래량 ≥ 전일 동시간대 ×3 (없으면 ×2 fallback)"
          />
          <Rule
            label="9시대 fallback"
            value="당일 누적 거래량 1위 (분봉 비교 불가)"
          />
          <Rule label="익절" value="+4%" />
          <Rule label="손절" value="-3%" />
          <Rule label="강제 청산" value="매수 + 30분" />
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
            <span className="text-gray-400 font-medium">①</span> 등락률 순위 조회
            (KIS <code className="text-xs">FHPST01700000</code>)에서 +5% 이상 종목 선별
          </li>
          <li>
            <span className="text-gray-400 font-medium">②</span> 전일 종가 ≥ 2,000원
            가격 필터 통과
          </li>
          <li>
            <span className="text-gray-400 font-medium">③</span> 직전 15분 거래량 / 전일
            동시간대 비율 (KIS <code className="text-xs">FHKST03010230</code>) ≥ 3배
            우선, 후보 없으면 ≥ 2배까지 확장
          </li>
          <li>
            <span className="text-gray-400 font-medium">④</span> 1순위 종목 시장가 즉시
            매수 → 매수+30분 1분 간격 가격 모니터링 → +4% / -3% / 30분 도달 시 청산
          </li>
        </ol>
      </section>

      <section className="glass-card p-5 md:p-6 space-y-3">
        <h2 className="text-base font-bold">변경 이력</h2>
        <div className="space-y-3 text-sm">
          <Change
            date="2026-04-29~"
            title="거래량 폭증 매집 추종"
            desc="1분 상시 스캔에 거래량 ≥3배 + 등락률 ≥+5% 필터를 결합. 9시대는 분봉 비교가 불가능해 누적 거래량 1위로 fallback."
          />
          <Change
            date="2026-04-15~"
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
