"use client";

import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { HoldingDetail } from "@/lib/data";
import { krw, pct } from "@/lib/format";
import DataTable from "./DataTable";

interface Props {
  holdings: Record<string, HoldingDetail>;
}

type HoldingRow = HoldingDetail & { ticker: string };

const col = createColumnHelper<HoldingRow>();

const columns = [
  col.accessor("name", {
    header: "종목",
    cell: (info) => (
      <Link href={`/stocks/${encodeURIComponent(info.row.original.ticker)}`} className="block hover:text-blue-400 transition-colors">
        <div className="font-medium">{info.getValue()}</div>
        <div className="text-xs text-gray-500">{info.row.original.ticker}</div>
      </Link>
    ),
  }),
  col.accessor("shares", {
    header: "수량",
    meta: { className: "text-right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{info.getValue()}주</span>
    ),
  }),
  col.accessor("avg_price", {
    header: "평균단가",
    meta: { className: "text-right hidden sm:table-cell" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{krw(info.getValue())}</span>
    ),
  }),
  col.accessor("current_price", {
    header: "현재가",
    meta: { className: "text-right hidden sm:table-cell" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{krw(info.getValue())}</span>
    ),
  }),
  col.accessor("value", {
    header: "평가금",
    meta: { className: "text-right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{krw(info.getValue())}</span>
    ),
  }),
  col.accessor("profit_pct", {
    header: "수익률",
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

export default function HoldingsTable({ holdings }: Props) {
  const data: HoldingRow[] = Object.entries(holdings).map(([ticker, h]) => ({
    ...h,
    ticker,
  }));

  if (data.length === 0) {
    return (
      <div className="text-gray-500 text-center py-4">보유 종목 없음</div>
    );
  }

  return <DataTable columns={columns} data={data} />;
}
