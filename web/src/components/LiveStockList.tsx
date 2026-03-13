"use client";

import Link from "next/link";
import { signColor } from "@/lib/format";
import { useLivePrices } from "@/lib/live-prices";

interface StockRow {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  change_pct: number;
  holders: number;
}

interface Props {
  stocks: StockRow[];
}

export default function LiveStockList({ stocks }: Props) {
  const { prices: livePrices, isLive, isClosingPrice } = useLivePrices();

  const rows = stocks.map((s) => {
    const live = livePrices?.[s.ticker];
    if ((isLive || isClosingPrice) && live) {
      return { ...s, price: live.price, change_pct: live.change_pct };
    }
    return s;
  }).sort((a, b) => b.change_pct - a.change_pct);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5 text-gray-500 text-xs">
            <th className="text-left py-2.5 px-4">종목</th>
            <th className="text-left py-2.5 px-4 hidden sm:table-cell">섹터</th>
            <th className="text-right py-2.5 px-4">현재가</th>
            <th className="text-right py-2.5 px-4">등락률</th>
            <th className="text-right py-2.5 px-4 hidden sm:table-cell">보유</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr
              key={s.ticker}
              className="border-b border-white/5 hover:bg-white/[0.02]"
            >
              <td className="py-2.5 px-4">
                <Link
                  href={`/stocks/${s.ticker}`}
                  className="font-medium hover:text-blue-400 transition-colors"
                >
                  {s.name}
                </Link>
              </td>
              <td className="py-2.5 px-4 text-gray-400 hidden sm:table-cell">
                {s.sector}
              </td>
              <td className="py-2.5 px-4 text-right tabular-nums">
                {s.price.toLocaleString()}
              </td>
              <td
                className={`py-2.5 px-4 text-right tabular-nums font-medium ${signColor(s.change_pct)}`}
              >
                {s.change_pct > 0 ? "+" : ""}
                {s.change_pct.toFixed(2)}%
              </td>
              <td className="py-2.5 px-4 text-right text-gray-400 hidden sm:table-cell">
                {s.holders > 0 ? `${s.holders}명` : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
