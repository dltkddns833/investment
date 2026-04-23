import Link from "next/link";
import { krw } from "@/lib/format";
import type { Allocation } from "@/lib/data";

interface LiveHolding {
  ticker: string;
  name: string;
  evalAmount: number;
}

interface Props {
  allocation: Allocation | null;
  liveHoldings: LiveHolding[];
  totalAsset: number;
  stockNameMap: Record<string, string>;
  investorName: string;
  date: string;
}

export default function LiveTodayAllocation({
  allocation,
  liveHoldings,
  totalAsset,
  stockNameMap,
  investorName,
  date,
}: Props) {
  if (!allocation) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-gray-400 mb-2">
          오늘 {investorName} allocation
        </h2>
        <p className="text-center text-xs text-gray-500 py-6">
          {date} {investorName} 배분이 아직 저장되지 않았습니다.
        </p>
      </div>
    );
  }

  const livePctMap: Record<string, number> = {};
  for (const h of liveHoldings) {
    livePctMap[h.ticker] = totalAsset > 0 ? (h.evalAmount / totalAsset) * 100 : 0;
  }

  const tickers = Array.from(
    new Set([...Object.keys(allocation.allocation), ...Object.keys(livePctMap)])
  );
  const rows = tickers
    .map((ticker) => {
      const targetPct = (allocation.allocation[ticker] ?? 0) * 100;
      const livePct = livePctMap[ticker] ?? 0;
      const name = stockNameMap[ticker] ?? ticker;
      return { ticker, name, targetPct, livePct, diff: livePct - targetPct };
    })
    .sort((a, b) => b.targetPct - a.targetPct);

  const totalTarget = rows.reduce((s, r) => s + r.targetPct, 0);
  const totalLive = rows.reduce((s, r) => s + r.livePct, 0);

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 sm:p-5">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-gray-400">
          오늘 {investorName} allocation vs 실전
        </h2>
        <span className="text-[11px] text-gray-500">
          {date} · 목표 {totalTarget.toFixed(1)}% / 실제 {totalLive.toFixed(1)}%
        </span>
      </div>

      {allocation.rationale && (
        <div className="mb-4 rounded-lg bg-white/5 border border-white/5 p-3">
          <p className="text-[11px] text-gray-500 mb-1">{investorName} 오늘 판단 근거</p>
          <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed line-clamp-6">
            {allocation.rationale}
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-white/10">
              <th className="text-left pb-2 font-medium">종목</th>
              <th className="text-right pb-2 font-medium">목표</th>
              <th className="text-right pb-2 font-medium">실제</th>
              <th className="text-right pb-2 font-medium">차이</th>
              <th className="text-right pb-2 font-medium">금액(목표)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => {
              const targetAmount = Math.round(totalAsset * (r.targetPct / 100));
              const diffColor =
                Math.abs(r.diff) < 1
                  ? "text-gray-500"
                  : r.diff > 0
                  ? "text-red-400"
                  : "text-blue-400";
              const isNewEntry = r.targetPct > 0 && r.livePct < 0.5;
              const isExiting = r.targetPct < 0.5 && r.livePct > 0;
              return (
                <tr key={r.ticker} className="hover:bg-white/5">
                  <td className="py-2">
                    <Link
                      href={`/stocks/${encodeURIComponent(r.ticker)}`}
                      className="text-blue-400 hover:underline"
                    >
                      {r.name}
                    </Link>
                    {isNewEntry && (
                      <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-red-500/20 text-red-400">
                        신규
                      </span>
                    )}
                    {isExiting && (
                      <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400">
                        정리
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right text-gray-300">
                    {r.targetPct.toFixed(1)}%
                  </td>
                  <td className="py-2 text-right text-gray-400">
                    {r.livePct.toFixed(1)}%
                  </td>
                  <td className={`py-2 text-right font-medium ${diffColor}`}>
                    {r.diff > 0 ? "+" : ""}
                    {r.diff.toFixed(1)}%p
                  </td>
                  <td className="py-2 text-right text-gray-500">
                    {krw(targetAmount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-500 mt-3">
        차이는 단주 체결과 수수료/슬리피지로 발생합니다. 차이가 크면 다음 리밸런싱에서 수렴합니다.
      </p>
    </div>
  );
}
