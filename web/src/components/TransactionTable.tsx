"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { Transaction } from "@/lib/data";
import { krw } from "@/lib/format";
import DataTable from "./DataTable";

interface Props {
  transactions: Transaction[];
}

const col = createColumnHelper<Transaction>();

const columns = [
  col.accessor("date", {
    header: "날짜",
    cell: (info) => (
      <span className="text-gray-400">{info.getValue()}</span>
    ),
  }),
  col.accessor("type", {
    header: "유형",
    meta: { className: "text-center" },
    cell: (info) => {
      const t = info.getValue();
      return (
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded ${
            t === "buy"
              ? "bg-red-900/30 text-red-400"
              : "bg-blue-900/30 text-blue-400"
          }`}
        >
          {t === "buy" ? "매수" : "매도"}
        </span>
      );
    },
  }),
  col.accessor("name", {
    header: "종목",
  }),
  col.accessor("shares", {
    header: "수량",
    meta: { className: "text-right hidden sm:table-cell" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{info.getValue()}주</span>
    ),
  }),
  col.accessor("price", {
    header: "단가",
    meta: { className: "text-right hidden sm:table-cell" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{krw(info.getValue())}</span>
    ),
  }),
  col.accessor("amount", {
    header: "금액",
    meta: { className: "text-right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{krw(info.getValue())}</span>
    ),
  }),
  col.accessor("fee", {
    header: "수수료",
    meta: { className: "text-right hidden md:table-cell" },
    cell: (info) => {
      const v = info.getValue();
      return v ? (
        <span className="font-mono tabular-nums text-yellow-500 text-xs">
          {krw(v)}
        </span>
      ) : (
        <span className="text-gray-600">-</span>
      );
    },
  }),
];

export default function TransactionTable({ transactions }: Props) {
  const data = transactions.slice().reverse();
  return <DataTable columns={columns} data={data} />;
}
