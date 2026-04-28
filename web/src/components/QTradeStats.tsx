"use client";

import { QSummaryStats } from "@/lib/data";
import { krw, pct } from "@/lib/format";

interface Props {
  stats: QSummaryStats;
  initialCapital: number;
}

export default function QTradeStats({ stats, initialCapital }: Props) {
  const cumReturnPct = stats.total_pnl / initialCapital * 100;

  const cards = [
    {
      label: "총 트레이드",
      value: `${stats.total_trades}회`,
      sub: `${stats.trading_days}거래일 · 일평균 ${stats.avg_trades_per_day.toFixed(1)}회`,
      color: "text-gray-200",
    },
    {
      label: "승률",
      value: `${stats.win_rate.toFixed(1)}%`,
      sub: `익절 ${stats.win_count} · 손절 ${stats.loss_count} · 강제 ${stats.forced_count}`,
      color: stats.win_rate >= 50 ? "text-red-400" : "text-blue-400",
    },
    {
      label: "평균 손익률",
      value: pct(stats.avg_pnl_pct),
      sub: "매매당 평균 수익률",
      color: stats.avg_pnl_pct >= 0 ? "text-red-400" : "text-blue-400",
    },
    {
      label: "누적 손익",
      value: krw(stats.total_pnl),
      sub: `누적 수익률 ${pct(cumReturnPct)}`,
      color: stats.total_pnl >= 0 ? "text-red-400" : "text-blue-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="glass-card p-3 md:p-4">
          <p className="text-xs text-gray-500 mb-1">{card.label}</p>
          <p className={`text-xl font-bold font-mono ${card.color}`}>{card.value}</p>
          <p className="text-xs text-gray-600 mt-1">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
