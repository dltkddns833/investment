"use client";

import { MarketPrice } from "@/lib/data";
import { krw, pct, signColor } from "@/lib/format";

interface Props {
  prices: Record<string, MarketPrice>;
}

export default function MarketTable({ prices }: Props) {
  const entries = Object.entries(prices);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700 text-gray-400">
            <th className="py-2 px-3 text-left">종목</th>
            <th className="py-2 px-3 text-right">현재가</th>
            <th className="py-2 px-3 text-right">등락률</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([ticker, data]) => (
            <tr
              key={ticker}
              className="border-b border-gray-800/50 hover:bg-gray-800/30"
            >
              <td className="py-2 px-3">
                <div className="font-medium">{data.name}</div>
                <div className="text-xs text-gray-500">{ticker}</div>
              </td>
              <td className="py-2 px-3 text-right font-mono">
                {krw(data.price)}
              </td>
              <td
                className={`py-2 px-3 text-right font-mono font-bold ${signColor(data.change_pct)}`}
              >
                {pct(data.change_pct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
