"use client";

import Link from "next/link";
import { Transaction } from "@/lib/data";
import { krw } from "@/lib/format";

interface Props {
  transactions: Transaction[];
  maxHeight?: string;
}

export default function TransactionTable({ transactions, maxHeight = "max-h-[320px]" }: Props) {
  const data = transactions.slice().reverse();

  return (
    <div className="flex flex-col">
      {/* thead 고정 */}
      <table className="w-full text-xs sm:text-sm shrink-0">
        <thead>
          <tr className="border-b border-white/10 text-gray-400 text-xs uppercase tracking-wider">
            <th className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 text-left whitespace-nowrap">날짜</th>
            <th className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 text-center whitespace-nowrap">유형</th>
            <th className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 text-left whitespace-nowrap">종목</th>
            <th className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 text-right whitespace-nowrap hidden sm:table-cell">수량</th>
            <th className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 text-right whitespace-nowrap hidden sm:table-cell">단가</th>
            <th className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 text-right whitespace-nowrap">금액</th>
            <th className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 text-right whitespace-nowrap hidden md:table-cell">수수료</th>
          </tr>
        </thead>
      </table>
      {/* tbody 스크롤 */}
      <div className={`${maxHeight} overflow-y-auto`}>
        <table className="w-full text-xs sm:text-sm">
          <tbody>
            {data.map((t, i) => (
              <tr key={i} className="border-b border-white/5 table-row-hover">
                <td className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 whitespace-nowrap">
                  <span className="text-gray-400">{t.date}</span>
                </td>
                <td className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 whitespace-nowrap text-center">
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded ${
                      t.type === "buy"
                        ? "bg-red-900/30 text-red-400"
                        : "bg-blue-900/30 text-blue-400"
                    }`}
                  >
                    {t.type === "buy" ? "매수" : "매도"}
                  </span>
                </td>
                <td className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 whitespace-nowrap">
                  <Link href={`/stocks/${encodeURIComponent(t.ticker)}`} className="hover:text-blue-400 transition-colors">
                    {t.name}
                  </Link>
                </td>
                <td className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 whitespace-nowrap text-right hidden sm:table-cell">
                  <span className="font-mono tabular-nums">{t.shares}주</span>
                </td>
                <td className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 whitespace-nowrap text-right hidden sm:table-cell">
                  <span className="font-mono tabular-nums">{krw(t.price)}</span>
                </td>
                <td className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 whitespace-nowrap text-right">
                  <span className="font-mono tabular-nums">{krw(t.amount)}</span>
                </td>
                <td className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 whitespace-nowrap text-right hidden md:table-cell">
                  {t.fee ? (
                    <span className="font-mono tabular-nums text-yellow-500 text-xs">{krw(t.fee)}</span>
                  ) : (
                    <span className="text-gray-600">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
