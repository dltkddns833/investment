"use client";

import { krw, signColor } from "@/lib/format";
import { useLivePrices } from "@/lib/live-prices";

interface Props {
  ticker: string;
  storedPrice: number;
  storedChangePct: number;
}

export default function LiveStockPrice({
  ticker,
  storedPrice,
  storedChangePct,
}: Props) {
  const { prices: livePrices, isLive, isClosingPrice } = useLivePrices();

  const live = livePrices?.[ticker];
  const price = (isLive || isClosingPrice) && live ? live.price : storedPrice;
  const changePct = (isLive || isClosingPrice) && live ? live.change_pct : storedChangePct;

  return (
    <div className="flex items-baseline gap-3 mt-3">
      <span className="text-2xl font-bold tabular-nums">{krw(price)}</span>
      <span
        className={`text-lg font-medium tabular-nums ${signColor(changePct)}`}
      >
        {changePct > 0 ? "+" : ""}
        {changePct.toFixed(2)}%
      </span>
      {isClosingPrice && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
          종가
        </span>
      )}
    </div>
  );
}
