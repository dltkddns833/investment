"use client";

import { QTradeCycle } from "@/lib/data";
import { krw, pct } from "@/lib/format";
import { useState } from "react";

interface Props {
  cycles: QTradeCycle[];
}

const EXIT_LABEL: Record<string, { label: string; cls: string }> = {
  win:    { label: "익절", cls: "bg-red-500/15 text-red-400 border-red-500/20" },
  loss:   { label: "손절", cls: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  forced: { label: "강제청산", cls: "bg-gray-500/15 text-gray-400 border-gray-500/20" },
};

function TradeCard({ cycle }: { cycle: QTradeCycle }) {
  const badge = EXIT_LABEL[cycle.exit_reason];
  const isProfit = cycle.pnl >= 0;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-200 truncate">{cycle.name}</span>
          <span className="text-xs text-gray-600">{cycle.ticker.split(".")[0]}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded border ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
        <div className="text-xs text-gray-500 mt-0.5 font-mono">
          매수 {cycle.buy_price.toLocaleString()} → 매도 {cycle.sell_price.toLocaleString()}
          <span className="ml-2 text-gray-600">{cycle.shares}주</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-bold font-mono ${isProfit ? "text-red-400" : "text-blue-400"}`}>
          {pct(cycle.pnl_pct)}
        </p>
        <p className={`text-xs font-mono ${isProfit ? "text-red-500/70" : "text-blue-500/70"}`}>
          {krw(cycle.pnl)}
        </p>
      </div>
    </div>
  );
}

export default function QTradeTimeline({ cycles }: Props) {
  const [showAll, setShowAll] = useState(false);

  if (cycles.length === 0) {
    return <p className="text-gray-500 text-sm">아직 체결된 매매가 없습니다.</p>;
  }

  // group by date (most recent first)
  const byDate = new Map<string, QTradeCycle[]>();
  for (const c of [...cycles].reverse()) {
    if (!byDate.has(c.date)) byDate.set(c.date, []);
    byDate.get(c.date)!.push(c);
  }

  const entries = Array.from(byDate.entries());
  const visible = showAll ? entries : entries.slice(0, 5);

  return (
    <div className="space-y-4">
      {visible.map(([date, dayCycles]) => {
        const dayPnl = dayCycles.reduce((s, c) => s + c.pnl, 0);
        return (
          <div key={date}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-400">{date}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{dayCycles.length}회</span>
                <span className={`text-xs font-mono font-bold ${dayPnl >= 0 ? "text-red-400" : "text-blue-400"}`}>
                  {krw(dayPnl)}
                </span>
              </div>
            </div>
            <div className="glass-card px-4 py-1">
              {dayCycles.map((c, i) => (
                <TradeCard key={`${c.ticker}-${i}`} cycle={c} />
              ))}
            </div>
          </div>
        );
      })}
      {entries.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors w-full text-center py-2"
        >
          {showAll ? "접기" : `이전 ${entries.length - 5}일 더 보기`}
        </button>
      )}
    </div>
  );
}
