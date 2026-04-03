import type { MarketRegime, AssetSnapshot } from "@/lib/data";

interface RegimeResult {
  returnPct: number;
  days: number;
}

function computeSingleInvestorRegimePerformance(
  regimes: MarketRegime[],
  assetHistory: AssetSnapshot[]
): Record<"bull" | "neutral" | "bear", RegimeResult | null> {
  const regimeMap = new Map<string, "bull" | "neutral" | "bear">();
  for (const r of regimes) regimeMap.set(r.date, r.regime);

  const assetMap = new Map<string, number>();
  for (const a of assetHistory) assetMap.set(a.date, a.total_asset);

  const dates = assetHistory
    .map((a) => a.date)
    .filter((d) => regimeMap.has(d))
    .sort();

  const perf = {
    bull: { totalReturn: 0, days: 0 },
    neutral: { totalReturn: 0, days: 0 },
    bear: { totalReturn: 0, days: 0 },
  };

  for (let i = 1; i < dates.length; i++) {
    const prev = assetMap.get(dates[i - 1]);
    const cur = assetMap.get(dates[i]);
    const regime = regimeMap.get(dates[i]);
    if (!prev || !cur || prev <= 0 || !regime) continue;
    perf[regime].totalReturn += (cur - prev) / prev;
    perf[regime].days++;
  }

  const toResult = (p: { totalReturn: number; days: number }): RegimeResult | null =>
    p.days === 0 ? null : { returnPct: Math.round(p.totalReturn * 10000) / 100, days: p.days };

  return {
    bull: toResult(perf.bull),
    neutral: toResult(perf.neutral),
    bear: toResult(perf.bear),
  };
}

const regimeConfig = {
  bull: { label: "강세장", emoji: "📈", bg: "bg-green-500/10", border: "border-green-500/20", color: "text-green-400" },
  neutral: { label: "중립장", emoji: "➡️", bg: "bg-gray-500/10", border: "border-gray-500/20", color: "text-gray-400" },
  bear: { label: "약세장", emoji: "📉", bg: "bg-red-500/10", border: "border-red-500/20", color: "text-red-400" },
} as const;

export default function InvestorRegimePerformance({
  regimes,
  assetHistory,
}: {
  regimes: MarketRegime[];
  assetHistory: AssetSnapshot[];
}) {
  const perf = computeSingleInvestorRegimePerformance(regimes, assetHistory);
  const hasAny = perf.bull || perf.neutral || perf.bear;
  if (!hasAny) return null;

  const minDays = Math.min(
    perf.bull?.days ?? 0,
    perf.neutral?.days ?? 0,
    perf.bear?.days ?? 0,
  );
  const insufficient = minDays < 20;

  return (
    <section className="glass-card p-4 md:p-5 animate-in">
      <h2 className="text-lg font-bold mb-3 section-header">국면별 수익률</h2>
      <p className="text-xs text-gray-500 mb-3">
        시장 국면(이동평균 기반)별 누적 일일수익률 합산
      </p>
      {insufficient && (
        <p className="text-xs text-yellow-500/80 mb-3">
          ⚠ 국면당 최소 20일 필요 (현재 강세 {perf.bull?.days ?? 0}일 · 중립 {perf.neutral?.days ?? 0}일 · 약세 {perf.bear?.days ?? 0}일) — 참고용
        </p>
      )}
      <div className="grid grid-cols-3 gap-3">
        {(["bull", "neutral", "bear"] as const).map((regime) => {
          const cfg = regimeConfig[regime];
          const data = perf[regime];
          return (
            <div
              key={regime}
              className={`rounded-xl p-3 border ${cfg.bg} ${cfg.border} text-center`}
            >
              <div className="text-xs text-gray-500 mb-1">
                {cfg.emoji} {cfg.label}
              </div>
              {data ? (
                <>
                  <div
                    className={`text-lg font-bold font-mono ${
                      data.returnPct >= 0 ? "text-red-400" : "text-blue-400"
                    }`}
                  >
                    {data.returnPct >= 0 ? "+" : ""}
                    {data.returnPct.toFixed(2)}%
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">{data.days}일</div>
                </>
              ) : (
                <div className="text-sm text-gray-600">-</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
