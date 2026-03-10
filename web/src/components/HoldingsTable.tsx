"use client";

import { HoldingDetail } from "@/lib/data";
import { krw, pct, signColor } from "@/lib/format";

interface Props {
  holdings: Record<string, HoldingDetail>;
}

export default function HoldingsTable({ holdings }: Props) {
  const entries = Object.entries(holdings);

  if (entries.length === 0) {
    return <div className="text-gray-500 text-center py-4">보유 종목 없음</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700 text-gray-400">
            <th className="py-2 px-3 text-left">종목</th>
            <th className="py-2 px-3 text-right">수량</th>
            <th className="py-2 px-3 text-right">평균단가</th>
            <th className="py-2 px-3 text-right">현재가</th>
            <th className="py-2 px-3 text-right">평가금</th>
            <th className="py-2 px-3 text-right">수익률</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([ticker, h]) => (
            <tr
              key={ticker}
              className="border-b border-gray-800/50 hover:bg-gray-800/30"
            >
              <td className="py-2 px-3">
                <div className="font-medium">{h.name}</div>
                <div className="text-xs text-gray-500">{ticker}</div>
              </td>
              <td className="py-2 px-3 text-right font-mono">{h.shares}주</td>
              <td className="py-2 px-3 text-right font-mono">
                {krw(h.avg_price)}
              </td>
              <td className="py-2 px-3 text-right font-mono">
                {krw(h.current_price)}
              </td>
              <td className="py-2 px-3 text-right font-mono">
                {krw(h.value)}
              </td>
              <td
                className={`py-2 px-3 text-right font-mono font-bold ${signColor(h.profit_pct)}`}
              >
                {pct(h.profit_pct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
