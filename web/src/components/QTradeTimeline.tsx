"use client";

import { QTradeCycle } from "@/lib/data";
import { krw, pct } from "@/lib/format";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  cycles: QTradeCycle[];
}

const EXIT_LABEL: Record<string, { label: string; cls: string }> = {
  win:    { label: "익절", cls: "bg-red-500/15 text-red-400 border-red-500/20" },
  loss:   { label: "손절", cls: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  forced: { label: "강제청산", cls: "bg-gray-500/15 text-gray-400 border-gray-500/20" },
};

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" });
}

function todayKST(): string {
  return new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .replace(/\. /g, "-").replace(".", "");
}

function TradeCard({ cycle }: { cycle: QTradeCycle }) {
  const badge = EXIT_LABEL[cycle.exit_reason];
  const isProfit = cycle.pnl >= 0;
  const buyTime = fmtTime(cycle.buy_at);
  const sellTime = fmtTime(cycle.sell_at);
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/stocks/${encodeURIComponent(cycle.ticker)}`} className="text-sm font-medium text-gray-200 hover:text-blue-300 transition-colors truncate">
            {cycle.name}
          </Link>
          <span className="text-xs text-gray-600">{cycle.ticker.split(".")[0]}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded border ${badge.cls}`}>
            {badge.label}
          </span>
          {(buyTime || sellTime) && (
            <span className="text-xs text-gray-600 font-mono">
              {buyTime}
              {buyTime && sellTime && " → "}
              {sellTime}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-0.5 font-mono">
          매수 {cycle.buy_price.toLocaleString()} → 매도 {cycle.sell_price.toLocaleString()}
          <span className="ml-2 text-gray-600">{cycle.shares}주</span>
          {cycle.total_fee > 0 && (
            <span className="ml-2 text-gray-700">수수료 {cycle.total_fee.toLocaleString()}원</span>
          )}
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

function DateGroup({ date, dayCycles, defaultOpen }: { date: string; dayCycles: QTradeCycle[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const dayPnl = dayCycles.reduce((s, c) => s + c.pnl, 0);
  const dayFee = dayCycles.reduce((s, c) => s + c.total_fee, 0);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between mb-2 hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-1.5">
          {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
          <span className="text-xs font-medium text-gray-400">{date}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{dayCycles.length}회</span>
          <span className={`text-xs font-mono font-bold ${dayPnl >= 0 ? "text-red-400" : "text-blue-400"}`}>
            {krw(dayPnl)}
          </span>
          {dayFee > 0 && (
            <span className="text-xs font-mono text-gray-500">
              · 수수료 {krw(dayFee)}
            </span>
          )}
        </div>
      </button>
      {open && (
        <div className="glass-card px-4 py-1">
          {dayCycles.map((c, i) => (
            <TradeCard key={`${c.ticker}-${i}`} cycle={c} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function QTradeTimeline({ cycles }: Props) {
  const [showAll, setShowAll] = useState(false);

  if (cycles.length === 0) {
    return <p className="text-gray-500 text-sm">아직 체결된 매매가 없습니다.</p>;
  }

  const today = todayKST();

  // group by date (most recent first)
  const byDate = new Map<string, QTradeCycle[]>();
  for (const c of [...cycles].reverse()) {
    if (!byDate.has(c.date)) byDate.set(c.date, []);
    byDate.get(c.date)!.push(c);
  }

  const totalFee = cycles.reduce((s, c) => s + c.total_fee, 0);
  const entries = Array.from(byDate.entries());
  const visible = showAll ? entries : entries.slice(0, 5);

  return (
    <div className="space-y-4">
      {totalFee > 0 && (
        <p className="text-xs text-gray-500 font-mono">
          누적 수수료 합계: <span className="text-gray-400">{krw(totalFee)}</span>
        </p>
      )}
      {visible.map(([date, dayCycles]) => (
        <DateGroup key={date} date={date} dayCycles={dayCycles} defaultOpen={date === today} />
      ))}
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
