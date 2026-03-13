"use client";

import type { MarketPrice, StockUniverse } from "@/lib/data";
import { useLivePrices } from "@/lib/live-prices";
import SectorHeatmap from "./SectorHeatmap";

interface Props {
  stocks: StockUniverse[];
  storedPrices: Record<string, MarketPrice>;
}

export default function LiveSectorHeatmap({ stocks, storedPrices }: Props) {
  const { prices: livePrices, isLive, isClosingPrice } = useLivePrices();

  const merged: Record<string, MarketPrice> = {};
  for (const [ticker, stored] of Object.entries(storedPrices)) {
    const live = livePrices?.[ticker];
    if ((isLive || isClosingPrice) && live) {
      merged[ticker] = { name: stored.name, price: live.price, change_pct: live.change_pct };
    } else {
      merged[ticker] = stored;
    }
  }

  return <SectorHeatmap stocks={stocks} marketPrices={merged} />;
}
