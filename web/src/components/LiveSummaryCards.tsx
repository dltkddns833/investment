"use client";

import { InvestorDetail } from "@/lib/data";
import { krw, pct, signColor } from "@/lib/format";
import { useLivePrices } from "@/lib/live-prices";

interface Props {
  totalInvested: number;
  storedTotalAsset: number;
  initialCapital: number;
  investorDetails: Record<string, InvestorDetail>;
}

export default function LiveSummaryCards({
  totalInvested,
  storedTotalAsset,
  initialCapital,
  investorDetails,
}: Props) {
  const { prices: livePrices, isLive } = useLivePrices();

  let totalAsset = storedTotalAsset;

  if (isLive && livePrices) {
    totalAsset = 0;
    for (const detail of Object.values(investorDetails)) {
      let stockValue = 0;
      for (const [ticker, h] of Object.entries(detail.holdings)) {
        const live = livePrices[ticker];
        stockValue += (live ? live.price : h.current_price) * h.shares;
      }
      totalAsset += detail.cash + stockValue;
    }
  }

  const totalReturn = totalAsset - totalInvested;
  const totalReturnPct = (totalAsset / totalInvested - 1) * 100;

  const returnBorderColor =
    totalReturn > 0
      ? "border-t-2 border-t-red-400/50"
      : totalReturn < 0
        ? "border-t-2 border-t-blue-400/50"
        : "";

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 stagger">
      <div className="glass-card card-shine animate-in p-3 md:p-5">
        <div className="text-gray-400 text-xs uppercase tracking-wider">
          총 투자금
        </div>
        <div className="text-lg md:text-2xl font-bold mt-1 tabular-nums">
          {krw(totalInvested)}
        </div>
      </div>
      <div className="glass-card card-shine animate-in p-3 md:p-5">
        <div className="text-gray-400 text-xs uppercase tracking-wider">
          총 자산
        </div>
        <div className="text-lg md:text-2xl font-bold mt-1 tabular-nums">
          {krw(totalAsset)}
        </div>
      </div>
      <div
        className={`glass-card card-shine animate-in p-3 md:p-5 ${returnBorderColor}`}
      >
        <div className="text-gray-400 text-xs uppercase tracking-wider">
          총 수익
        </div>
        <div
          className={`text-lg md:text-2xl font-bold mt-1 tabular-nums ${signColor(totalReturn)}`}
        >
          {totalReturn >= 0 ? "+" : ""}
          {krw(totalReturn)}
        </div>
      </div>
      <div
        className={`glass-card card-shine animate-in p-3 md:p-5 ${returnBorderColor}`}
      >
        <div className="text-gray-400 text-xs uppercase tracking-wider">
          평균 수익률
        </div>
        <div
          className={`text-lg md:text-2xl font-bold mt-1 tabular-nums ${signColor(totalReturnPct)}`}
        >
          {pct(totalReturnPct)}
        </div>
      </div>
    </div>
  );
}
