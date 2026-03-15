import type { EtfInfo } from "@/lib/etf-data";
import Link from "next/link";

const CATEGORY_COLORS: Record<string, string> = {
  "지수ETF": "bg-indigo-500/20 text-indigo-300",
  "섹터ETF": "bg-violet-500/20 text-violet-300",
  "해외ETF": "bg-sky-500/20 text-sky-300",
  "채권ETF": "bg-teal-500/20 text-teal-300",
  "배당ETF": "bg-emerald-500/20 text-emerald-300",
};

const BAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-teal-500",
  "bg-amber-500", "bg-rose-500", "bg-sky-500",
  "bg-emerald-500", "bg-orange-500",
];

interface Props {
  etf: EtfInfo;
}

export default function EtfDetail({ etf }: Props) {
  const categoryColor = CATEGORY_COLORS[etf.category] ?? "bg-gray-500/20 text-gray-300";
  const maxSectorWeight = Math.max(...etf.sectorWeights.map((s) => s.weight));

  return (
    <div className="space-y-5">
      {/* 헤더 정보 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${categoryColor}`}>
          {etf.category}
        </span>
        <span className="text-sm text-gray-400">{etf.benchmark}</span>
      </div>

      {etf.note && (
        <div className="flex items-start gap-2 text-xs text-amber-400/80 bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2">
          <span className="shrink-0 mt-0.5">⚠</span>
          <span>{etf.note}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 섹터/업종 비중 */}
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">섹터 비중</h3>
          <div className="space-y-2.5">
            {etf.sectorWeights.map((s, i) => (
              <div key={s.sector}>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{s.sector}</span>
                  <span className="tabular-nums font-medium text-gray-200">
                    {s.weight.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`}
                    style={{ width: `${(s.weight / maxSectorWeight) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 주요 구성 종목 */}
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">주요 구성 종목</h3>
          <div className="space-y-1.5">
            {etf.topHoldings.map((h, i) => (
              <div key={h.name} className="flex items-center gap-2">
                <span className="text-xs text-gray-600 w-4 text-right shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 flex items-center justify-between min-w-0">
                  {h.ticker ? (
                    <Link
                      href={`/stocks/${encodeURIComponent(h.ticker)}`}
                      className="text-sm text-blue-300 hover:text-blue-200 transition-colors truncate"
                    >
                      {h.name}
                    </Link>
                  ) : (
                    <span className="text-sm text-gray-300 truncate">{h.name}</span>
                  )}
                  <span className="text-xs tabular-nums text-gray-400 shrink-0 ml-2">
                    {h.weight.toFixed(1)}%
                  </span>
                </div>
                {/* 비중 미니바 */}
                <div className="w-12 h-1 bg-white/5 rounded-full overflow-hidden shrink-0">
                  <div
                    className="h-full bg-blue-500/60 rounded-full"
                    style={{
                      width: `${(h.weight / etf.topHoldings[0].weight) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-3">
            * 운용사 공시 기준 주요 편입 종목 (비중은 변동될 수 있음)
          </p>
        </div>
      </div>
    </div>
  );
}
