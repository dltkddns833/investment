"use client";

import { MarketPrice, StockUniverse } from "@/lib/data";
import { useLivePrices } from "@/lib/live-prices";
import MarketTable from "./MarketTable";
import ShowMore from "./ShowMore";

interface Props {
  storedPrices: Record<string, MarketPrice>;
  storedFetchedAt: string;
  sectorMap: Record<string, string>;
  stocks: StockUniverse[];
}

export default function LiveMarketSection({
  storedPrices,
  storedFetchedAt,
  sectorMap,
  stocks,
}: Props) {
  const { prices: livePrices, fetchedAt: liveFetchedAt, isLive, isMarketOpen, isClosingPrice, isRefreshing, refresh } =
    useLivePrices();

  // Merge: start from all stocks in universe, fill with stored or live prices
  const prices: Record<string, MarketPrice> = {};
  for (const stock of stocks) {
    const { ticker } = stock;
    const stored = storedPrices[ticker];
    const live = livePrices?.[ticker];

    if ((isLive || isClosingPrice) && live) {
      prices[ticker] = { name: stock.name, price: live.price, change_pct: live.change_pct };
    } else if (stored) {
      prices[ticker] = stored;
    } else if (live) {
      // stock_universe에 있지만 market_prices에 없는 종목 → 라이브 가격으로 채움
      prices[ticker] = { name: stock.name, price: live.price, change_pct: live.change_pct };
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
          sectorMap={sectorMap}
        />
      </ShowMore>
    </section>
  );
}
