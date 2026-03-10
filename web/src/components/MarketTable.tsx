"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { MarketPrice } from "@/lib/data";
import { krw, pct } from "@/lib/format";
import DataTable from "./DataTable";

interface Props {
  prices: Record<string, MarketPrice>;
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

export default function MarketTable({ prices }: Props) {
  const data: MarketRow[] = Object.entries(prices).map(([ticker, p]) => ({
    ...p,
    ticker,
  }));

  return <DataTable columns={columns} data={data} />;
}
