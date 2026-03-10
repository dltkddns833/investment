"use client";

import Link from "next/link";
import { RankingEntry } from "@/lib/data";
import { krw, pct, signColor } from "@/lib/format";

interface Props {
  rankings: RankingEntry[];
  investorIds: Record<string, string>;
}

export default function RankingTable({ rankings, investorIds }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700 text-gray-400">
            <th className="py-3 px-4 text-left">순위</th>
            <th className="py-3 px-4 text-left">투자자</th>
            <th className="py-3 px-4 text-left">전략</th>
            <th className="py-3 px-4 text-right">총자산</th>
            <th className="py-3 px-4 text-right">수익률</th>
            <th className="py-3 px-4 text-right">종목수</th>
            <th className="py-3 px-4 text-right">현금비중</th>
            <th className="py-3 px-4 text-center">리밸런싱</th>
            <th className="py-3 px-4 text-center">오늘 실행</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((r) => {
            const id = investorIds[r.investor] || "";
            return (
              <tr
                key={r.rank}
                className="border-b border-gray-800 hover:bg-gray-800/50"
              >
                <td className="py-3 px-4 font-bold text-lg">{r.rank}</td>
                <td className="py-3 px-4">
                  <Link
                    href={`/investors/${id}`}
                    className="text-blue-400 hover:underline font-medium"
                  >
                    {r.investor}
                  </Link>
                </td>
                <td className="py-3 px-4 text-gray-400">{r.strategy}</td>
                <td className="py-3 px-4 text-right font-mono">
                  {krw(r.total_asset)}
                </td>
                <td
                  className={`py-3 px-4 text-right font-mono font-bold ${signColor(r.total_return_pct)}`}
                >
                  {pct(r.total_return_pct)}
                </td>
                <td className="py-3 px-4 text-right">{r.num_holdings}</td>
                <td className="py-3 px-4 text-right">{r.cash_ratio}%</td>
                <td className="py-3 px-4 text-center text-gray-400">
                  {r.rebalance_frequency_days}일마다
                </td>
                <td className="py-3 px-4 text-center">
                  {r.rebalanced_today ? (
                    <span className="text-green-400 font-bold">O</span>
                  ) : (
                    <span className="text-gray-600">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
