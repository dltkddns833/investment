"use client";

import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { RankingEntry } from "@/lib/data";
import { krw, pct } from "@/lib/format";
import DataTable from "./DataTable";

interface Props {
  rankings: RankingEntry[];
  investorIds: Record<string, string>;
}

function rankClass(rank: number): string {
  if (rank === 1) return "rank-badge rank-1";
  if (rank === 2) return "rank-badge rank-2";
  if (rank === 3) return "rank-badge rank-3";
  return "rank-badge bg-gray-700 text-gray-300";
}

const col = createColumnHelper<RankingEntry & { _investorId: string }>();

function getColumns() {
  return [
    col.accessor("rank", {
      header: "순위",
      cell: (info) => (
        <span className={rankClass(info.getValue())}>{info.getValue()}</span>
      ),
    }),
    col.accessor("investor", {
      header: "투자자",
      cell: (info) => (
        <Link
          href={`/investors/${info.row.original._investorId}`}
          className="text-blue-400 hover:text-blue-300 hover:underline font-medium transition-colors"
        >
          {info.getValue()}
        </Link>
      ),
    }),
    col.accessor("strategy", {
      header: "전략",
      cell: (info) => (
        <span className="text-gray-400">{info.getValue()}</span>
      ),
    }),
    col.accessor("total_asset", {
      header: "총자산",
      meta: { className: "text-right" },
      cell: (info) => (
        <span className="font-mono tabular-nums">{krw(info.getValue())}</span>
      ),
    }),
    col.accessor("total_return_pct", {
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
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${cls}`}
          >
            {pct(v)}
          </span>
        );
      },
    }),
    col.accessor("num_holdings", {
      header: "종목수",
      meta: { className: "text-right" },
      cell: (info) => (
        <span className="tabular-nums">{info.getValue()}</span>
      ),
    }),
    col.accessor("cash_ratio", {
      header: "현금비중",
      meta: { className: "text-right" },
      cell: (info) => (
        <span className="tabular-nums">{info.getValue()}%</span>
      ),
    }),
    col.accessor("rebalance_frequency_days", {
      header: "리밸런싱",
      meta: { className: "text-center" },
      cell: (info) => (
        <span className="text-gray-400">{info.getValue()}일마다</span>
      ),
    }),
    col.accessor("rebalanced_today", {
      header: "오늘 실행",
      meta: { className: "text-center" },
      cell: (info) =>
        info.getValue() ? (
          <span className="relative flex h-2.5 w-2.5 mx-auto">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400" />
          </span>
        ) : (
          <span className="inline-flex h-2.5 w-2.5 mx-auto rounded-full bg-gray-700" />
        ),
    }),
  ];
}

export default function RankingTable({ rankings, investorIds }: Props) {
  const data = rankings.map((r) => ({
    ...r,
    _investorId: investorIds[r.investor] || "",
  }));

  return <DataTable columns={getColumns()} data={data} />;
}
