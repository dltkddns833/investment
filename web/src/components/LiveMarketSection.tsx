"use client";

import { MarketPrice } from "@/lib/data";
import { useLivePrices } from "@/lib/live-prices";
import MarketTable from "./MarketTable";
import ShowMore from "./ShowMore";

interface Props {
  storedPrices: Record<string, MarketPrice>;
  storedFetchedAt: string;
}

export default function LiveMarketSection({
  storedPrices,
  storedFetchedAt,
}: Props) {
  const { prices: livePrices, fetchedAt: liveFetchedAt, isLive, isMarketOpen, isClosingPrice, isRefreshing, refresh } =
    useLivePrices();

  // Merge live prices with stored names
  const prices: Record<string, MarketPrice> = {};
  for (const [ticker, stored] of Object.entries(storedPrices)) {
    const live = livePrices?.[ticker];
    if ((isLive || isClosingPrice) && live) {
      prices[ticker] = { name: stored.name, price: live.price, change_pct: live.change_pct };
    } else {
      prices[ticker] = stored;
    }
  }

  const fetchedAt = (isLive || isClosingPrice) && liveFetchedAt ? liveFetchedAt : storedFetchedAt;
  const marketRows = Object.keys(prices).length;

  return (
    <section className="glass-card overflow-hidden animate-in order-2 lg:order-1">
      <ShowMore
        maxHeight="max-h-[300px]"
        remaining={marketRows > 5 ? marketRows - 5 : undefined}
      >
        <MarketTable
          prices={prices}
          fetchedAt={fetchedAt}
          onRefresh={(isMarketOpen || isClosingPrice) ? refresh : undefined}
          isRefreshing={isRefreshing}
          isLive={isLive}
          isClosingPrice={isClosingPrice}
        />
      </ShowMore>
    </section>
  );
}
