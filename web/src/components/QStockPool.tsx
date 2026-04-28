"use client";

import { QSummaryStats } from "@/lib/data";
import Link from "next/link";

interface Props {
  stats: QSummaryStats;
}

export default function QStockPool({ stats }: Props) {
  const { top_stocks, total_trades, kospi_count, kosdaq_count } = stats;

  if (top_stocks.length === 0) {
    return <p className="text-gray-500 text-sm">데이터 없음</p>;
  }

  const maxCount = top_stocks[0].count;
  const kospiPct = total_trades > 0 ? (kospi_count / total_trades) * 100 : 0;
  const kosdaqPct = total_trades > 0 ? (kosdaq_count / total_trades) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* KOSPI/KOSDAQ ratio */}
      <div>
        <p className="text-xs text-gray-500 mb-2">시장 구분</p>
        <div className="flex gap-3 text-sm">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-gray-300">KOSPI</span>
            <span className="font-mono text-gray-200">{kospi_count}회 ({kospiPct.toFixed(0)}%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-purple-400" />
            <span className="text-gray-300">KOSDAQ</span>
            <span className="font-mono text-gray-200">{kosdaq_count}회 ({kosdaqPct.toFixed(0)}%)</span>
          </div>
        </div>
        <div className="h-2 rounded-full bg-white/5 mt-2 overflow-hidden flex">
          <div className="bg-blue-500/60 h-full" style={{ width: `${kospiPct}%` }} />
          <div className="bg-purple-500/60 h-full" style={{ width: `${kosdaqPct}%` }} />
        </div>
      </div>

      {/* Top stocks */}
      <div>
        <p className="text-xs text-gray-500 mb-2">자주 매매한 종목 (Top {top_stocks.length})</p>
        <div className="space-y-1.5">
          {top_stocks.map((s) => (
            <Link key={s.ticker} href={`/stocks/${encodeURIComponent(s.ticker)}`} className="flex items-center gap-2 group">
              <span className="text-xs text-gray-400 w-20 truncate shrink-0 group-hover:text-blue-300 transition-colors">{s.name}</span>
              <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden">
                <div
                  className="h-full bg-yellow-500/40 group-hover:bg-yellow-500/60 rounded flex items-center px-1.5 transition-all"
                  style={{ width: `${(s.count / maxCount) * 100}%`, minWidth: "2rem" }}
                >
                  <span className="text-xs font-mono text-yellow-300">{s.count}</span>
                </div>
              </div>
              <span className="text-xs text-gray-600 w-6 text-right">{s.ticker.split(".")[0]}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
