"use client";

import type { InvestorDetail } from "@/lib/data";
import { krw } from "@/lib/format";

interface Props {
  detailA: InvestorDetail;
  detailB: InvestorDetail;
}

export default function VersusPositionCompare({ detailA, detailB }: Props) {
  const tickersA = new Set(Object.keys(detailA.holdings));
  const tickersB = new Set(Object.keys(detailB.holdings));
  const shared = [...tickersA].filter((t) => tickersB.has(t));
  const onlyA = [...tickersA].filter((t) => !tickersB.has(t));
  const onlyB = [...tickersB].filter((t) => !tickersA.has(t));

  const renderHolding = (ticker: string, detail: InvestorDetail) => {
    const h = detail.holdings[ticker];
    if (!h) return null;
    return (
      <div key={ticker} className="flex items-center justify-between py-1 text-xs">
        <span className="text-gray-300 truncate">{h.name}</span>
        <span className={h.profit_pct >= 0 ? "text-red-400" : "text-blue-400"}>
          {h.profit_pct >= 0 ? "+" : ""}{h.profit_pct.toFixed(1)}%
        </span>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Only A */}
      <div className="bg-white/[0.02] rounded-xl p-3 border border-white/5">
        <div className="text-xs text-gray-500 mb-2">
          {detailA.investor}만 보유
          <span className="ml-1 text-gray-600">{onlyA.length}종목</span>
        </div>
        <div className="space-y-0.5">
          {onlyA.length > 0
            ? onlyA.map((t) => renderHolding(t, detailA))
            : <div className="text-xs text-gray-600">없음</div>}
        </div>
      </div>

      {/* Shared */}
      <div className="bg-white/[0.02] rounded-xl p-3 border border-emerald-500/20">
        <div className="text-xs text-emerald-400 mb-2">
          공통 보유
          <span className="ml-1 text-emerald-600">{shared.length}종목</span>
        </div>
        <div className="space-y-1">
          {shared.length > 0
            ? shared.map((ticker) => {
                const hA = detailA.holdings[ticker];
                const hB = detailB.holdings[ticker];
                return (
                  <div key={ticker} className="text-xs">
                    <div className="text-gray-300 truncate">{hA?.name ?? ticker}</div>
                    <div className="flex justify-between text-[10px] mt-0.5">
                      <span className={hA && hA.profit_pct >= 0 ? "text-red-400" : "text-blue-400"}>
                        {hA ? `${krw(hA.value)}` : "-"}
                      </span>
                      <span className={hB && hB.profit_pct >= 0 ? "text-red-400" : "text-blue-400"}>
                        {hB ? `${krw(hB.value)}` : "-"}
                      </span>
                    </div>
                  </div>
                );
              })
            : <div className="text-xs text-gray-600">없음</div>}
        </div>
      </div>

      {/* Only B */}
      <div className="bg-white/[0.02] rounded-xl p-3 border border-white/5">
        <div className="text-xs text-gray-500 mb-2">
          {detailB.investor}만 보유
          <span className="ml-1 text-gray-600">{onlyB.length}종목</span>
        </div>
        <div className="space-y-0.5">
          {onlyB.length > 0
            ? onlyB.map((t) => renderHolding(t, detailB))
            : <div className="text-xs text-gray-600">없음</div>}
        </div>
      </div>
    </div>
  );
}
