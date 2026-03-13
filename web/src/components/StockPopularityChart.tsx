"use client";

import type { StockPopularity } from "@/lib/data";

interface Props {
  data: StockPopularity[];
  totalInvestors: number;
}

export default function StockPopularityChart({ data, totalInvestors }: Props) {
  return (
    <div className="space-y-1.5">
      {data.map((stock) => (
        <div key={stock.ticker} className="flex items-center gap-2">
          <div className="w-16 md:w-20 text-xs truncate shrink-0 text-gray-300">
            {stock.name}
          </div>
          <div className="flex-1 bg-gray-700/30 rounded-full h-5 relative overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                stock.holderCount >= 7
                  ? "bg-gradient-to-r from-amber-500 to-orange-500"
                  : stock.holderCount >= 4
                    ? "bg-gradient-to-r from-blue-500 to-blue-400"
                    : stock.holderCount >= 1
                      ? "bg-gradient-to-r from-slate-500 to-slate-400"
                      : ""
              }`}
              style={{ width: `${(stock.holderCount / totalInvestors) * 100}%` }}
            />
            {stock.holderCount > 0 && (
              <span className="absolute inset-0 flex items-center px-2 text-[10px] text-white/80">
                {stock.holders.join(", ")}
              </span>
            )}
          </div>
          <div className="w-12 text-right text-xs tabular-nums shrink-0">
            <span className={stock.holderCount >= 7 ? "text-amber-400" : stock.holderCount === 0 ? "text-gray-600" : "text-gray-400"}>
              {stock.holderCount}명
            </span>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3 mt-3 text-[10px] text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-sm bg-gradient-to-r from-amber-500 to-orange-500" />
          컨센서스 (7명+)
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-sm bg-gradient-to-r from-blue-500 to-blue-400" />
          보통 (4~6명)
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-sm bg-gradient-to-r from-slate-500 to-slate-400" />
          독자적 (1~3명)
        </div>
      </div>
    </div>
  );
}
