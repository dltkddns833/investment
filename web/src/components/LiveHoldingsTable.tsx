"use client";

import Link from "next/link";
import { krw } from "@/lib/format";

interface HoldingRow {
  ticker: string;
  name: string;
  shares: number;
  avg_price: number;
  sector: string;
}

export default function LiveHoldingsTable({
  holdings,
}: {
  holdings: HoldingRow[];
}) {
  if (holdings.length === 0) {
    return <p className="text-center text-gray-500 py-4">보유종목 없음</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 text-xs border-b border-white/10">
            <th className="text-left pb-2 font-medium">종목</th>
            <th className="text-left pb-2 font-medium">섹터</th>
            <th className="text-right pb-2 font-medium">수량</th>
            <th className="text-right pb-2 font-medium">평균단가</th>
            <th className="text-right pb-2 font-medium">평가금액</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {holdings.map((h) => (
            <tr key={h.ticker} className="hover:bg-white/5">
              <td className="py-2.5">
                <Link
                  href={`/stocks/${encodeURIComponent(h.ticker)}`}
                  className="text-blue-400 hover:underline"
                >
                  {h.name}
                </Link>
                <span className="text-gray-500 text-xs ml-1">
                  {h.ticker.replace(/\.(KS|KQ)$/, "")}
                </span>
              </td>
              <td className="py-2.5 text-gray-400">{h.sector}</td>
              <td className="py-2.5 text-right">{h.shares}주</td>
              <td className="py-2.5 text-right">{krw(h.avg_price)}</td>
              <td className="py-2.5 text-right font-medium">
                {krw(h.shares * h.avg_price)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
