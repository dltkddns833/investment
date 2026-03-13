"use client";

import Link from "next/link";
import { krw, signColor } from "@/lib/format";
import { useLivePrices } from "@/lib/live-prices";
import InvestorAvatar from "./InvestorAvatar";

interface Holder {
  name: string;
  investorId: string;
  shares: number;
  avg_price: number;
  value: number;
  profit: number;
  profit_pct: number;
}

interface Props {
  ticker: string;
  holders: Holder[];
}

export default function LiveStockHolders({ ticker, holders }: Props) {
  const { prices: livePrices, isLive, isClosingPrice } = useLivePrices();

  const live = livePrices?.[ticker];
  const livePrice = (isLive || isClosingPrice) && live ? live.price : null;

  const rows = holders.map((h) => {
    if (livePrice) {
      const value = h.shares * livePrice;
      const profit = value - h.shares * h.avg_price;
      const profit_pct =
        h.avg_price > 0
          ? +((((livePrice - h.avg_price) / h.avg_price) * 100).toFixed(2))
          : 0;
      return { ...h, value, profit, profit_pct };
    }
    return h;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="border-b border-white/5 text-gray-500 text-xs">
            <th className="text-left py-2.5 px-2 sm:px-4">투자자</th>
            <th className="text-right py-2.5 px-2 sm:px-4 hidden sm:table-cell">수량</th>
            <th className="text-right py-2.5 px-2 sm:px-4 hidden sm:table-cell">평균단가</th>
            <th className="text-right py-2.5 px-2 sm:px-4">평가금</th>
            <th className="text-right py-2.5 px-2 sm:px-4">수익률</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr
              key={h.investorId}
              className="border-b border-white/5 hover:bg-white/[0.02]"
            >
              <td className="py-2.5 px-2 sm:px-4">
                <Link
                  href={`/investors/${h.investorId}`}
                  className="inline-flex items-center gap-2 font-medium hover:text-blue-400 transition-colors"
                >
                  <InvestorAvatar investorId={h.investorId} size="sm" />
                  {h.name}
                </Link>
              </td>
              <td className="py-2.5 px-2 sm:px-4 text-right tabular-nums hidden sm:table-cell">
                {h.shares}주
              </td>
              <td className="py-2.5 px-2 sm:px-4 text-right tabular-nums text-gray-400 hidden sm:table-cell">
                {krw(h.avg_price)}
              </td>
              <td className="py-2.5 px-2 sm:px-4 text-right tabular-nums">
                {krw(h.value)}
              </td>
              <td
                className={`py-2.5 px-2 sm:px-4 text-right tabular-nums font-medium ${signColor(h.profit_pct)}`}
              >
                {h.profit_pct > 0 ? "+" : ""}
                {h.profit_pct.toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
