"use client";

import { useEffect, useState } from "react";
import { krw, pct, signColor } from "@/lib/format";

interface Holding {
  ticker: string;
  name: string;
  shares: number;
  buy_price: number;
  buy_at_kst: string | null;
  current_price: number | null;
  pnl_pct: number | null;
  pnl_amount: number | null;
  forced_exit_at: string | null;
}

interface Props {
  holding: Holding;
}

export default function HoldingCard({ holding }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  const remainSec = holding.forced_exit_at
    ? Math.max(0, Math.floor((new Date(holding.forced_exit_at).getTime() - now) / 1000))
    : null;
  const mm = remainSec !== null ? String(Math.floor(remainSec / 60)).padStart(2, "0") : "--";
  const ss = remainSec !== null ? String(remainSec % 60).padStart(2, "0") : "--";

  const buyTimeKst = holding.buy_at_kst
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date(holding.buy_at_kst))
    : "-";

  // PnL 게이지 (-3% ~ +4% 범위로 매핑)
  const pnlPct = holding.pnl_pct ?? 0;
  const minPct = -3;
  const maxPct = 4;
  const clamped = Math.max(minPct, Math.min(maxPct, pnlPct));
  const gaugePct = ((clamped - minPct) / (maxPct - minPct)) * 100;
  const breakEvenPct = ((0 - minPct) / (maxPct - minPct)) * 100;

  return (
    <div className="glass-card p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs text-gray-500">보유 종목</div>
          <div className="text-xl sm:text-2xl md:text-3xl font-bold mt-0.5 break-keep">
            {holding.name}
          </div>
          <div className="text-xs text-gray-500 mt-1 font-mono">
            {holding.ticker} · {holding.shares}주
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">매수+30분 청산까지</div>
          <div
            className={`font-mono text-2xl sm:text-3xl md:text-4xl tabular-nums mt-0.5 ${
              remainSec !== null && remainSec < 300 ? "text-red-400" : "text-yellow-300"
            }`}
          >
            {mm}:{ss}
          </div>
          <div className="text-xs text-gray-500 mt-1">진입 {buyTimeKst}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div>
          <div className="text-[11px] sm:text-xs text-gray-500">매수가</div>
          <div className="text-sm sm:text-lg font-semibold mt-0.5">
            {krw(holding.buy_price)}
          </div>
        </div>
        <div>
          <div className="text-[11px] sm:text-xs text-gray-500">현재가</div>
          <div className="text-sm sm:text-lg font-semibold mt-0.5">
            {holding.current_price !== null ? krw(holding.current_price) : "-"}
          </div>
        </div>
        <div>
          <div className="text-[11px] sm:text-xs text-gray-500">평가손익</div>
          <div
            className={`text-sm sm:text-lg font-semibold mt-0.5 ${
              holding.pnl_amount !== null ? signColor(holding.pnl_amount) : "text-gray-500"
            }`}
          >
            {holding.pnl_amount !== null ? krw(holding.pnl_amount) : "-"}
            {holding.pnl_pct !== null && (
              <div className="text-xs">({pct(holding.pnl_pct)})</div>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>손절 -3%</span>
          <span>본전</span>
          <span>익절 +4%</span>
        </div>
        <div className="relative h-2 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full w-px bg-slate-600"
            style={{ left: `${breakEvenPct}%` }}
          />
          <div
            className={`absolute top-0 h-full rounded-full transition-all ${
              pnlPct >= 0
                ? "bg-gradient-to-r from-yellow-500 to-red-500"
                : "bg-gradient-to-r from-blue-500 to-blue-700"
            }`}
            style={{
              left: pnlPct >= 0 ? `${breakEvenPct}%` : `${gaugePct}%`,
              width: `${Math.abs(gaugePct - breakEvenPct)}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
