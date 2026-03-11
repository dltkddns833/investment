"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { MarketPrice } from "@/lib/data";
import { krw, pct } from "@/lib/format";
import DataTable from "./DataTable";

interface Props {
  prices: Record<string, MarketPrice>;
  fetchedAt?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  isLive?: boolean;
}

type MarketRow = MarketPrice & { ticker: string };

const col = createColumnHelper<MarketRow>();

const columns = [
  col.accessor("name", {
    header: "종목",
    cell: (info) => (
      <div>
        <div className="font-medium">{info.getValue()}</div>
        <div className="text-xs text-gray-500">{info.row.original.ticker}</div>
      </div>
    ),
  }),
  col.accessor("price", {
    header: "현재가",
    meta: { className: "text-right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{krw(info.getValue())}</span>
    ),
  }),
  col.accessor("change_pct", {
    header: "등락률",
    meta: { className: "text-right" },
    cell: (info) => {
      const v = info.getValue();
      const cls =
        v > 0
          ? "bg-red-500/10 text-red-400"
          : v < 0
            ? "bg-blue-500/10 text-blue-400"
            : "bg-gray-500/10 text-gray-400";
      return (
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold font-mono tabular-nums ${cls}`}
        >
          {pct(v)}
        </span>
      );
    },
  }),
];

export default function MarketTable({
  prices,
  fetchedAt,
  onRefresh,
  isRefreshing,
  isLive,
}: Props) {
  const data: MarketRow[] = Object.entries(prices).map(([ticker, p]) => ({
    ...p,
    ticker,
  }));

  const timeStr = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Seoul",
      })
    : null;

  return (
    <>
      <div className="py-4 px-4 border-b border-white/5 flex items-center justify-between">
        <h2 className="text-xl font-bold section-header flex items-center gap-2">
          시장 현황
          {isLive && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
              </span>
              LIVE
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {timeStr && (
            <span className="text-xs text-gray-500">{timeStr} 조회</span>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
              aria-label="새로고침"
            >
              <svg
                className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
      <DataTable columns={columns} data={data} />
    </>
  );
}
