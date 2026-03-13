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

  // Merge: stock_universe 기준으로 stored + live 가격 병합
  const merged: Record<string, MarketPrice> = {};
  for (const stock of stocks) {
    const { ticker } = stock;
    const stored = storedPrices[ticker];
    const live = livePrices?.[ticker];

    if ((isLive || isClosingPrice) && live) {
      merged[ticker] = { name: stock.name, price: live.price, change_pct: live.change_pct };
    } else if (stored) {
      merged[ticker] = stored;
    } else if (live) {
      merged[ticker] = { name: stock.name, price: live.price, change_pct: live.change_pct };
    }
  }

  return <SectorHeatmap stocks={stocks} marketPrices={merged} />;
}
