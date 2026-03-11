"use client";

import { useState, useEffect, useCallback } from "react";
import { MarketPrice } from "@/lib/data";
import MarketTable from "./MarketTable";
import ShowMore from "./ShowMore";

interface Props {
  storedPrices: Record<string, MarketPrice>;
  storedFetchedAt: string;
  isMarketOpen: boolean;
}

export default function LiveMarketSection({
  storedPrices,
  storedFetchedAt,
  isMarketOpen,
}: Props) {
  const [livePrices, setLivePrices] = useState<Record<
    string,
    MarketPrice
  > | null>(null);
  const [liveFetchedAt, setLiveFetchedAt] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const tickers = Object.keys(storedPrices);
  const marketRows = tickers.length;

  const fetchLive = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(
        `/api/live-prices?tickers=${tickers.join(",")}`
      );
      if (!res.ok) return;
      const data = await res.json();

      // Merge: live price/change_pct + stored name
      const merged: Record<string, MarketPrice> = {};
      for (const ticker of tickers) {
        const live = data.prices[ticker];
        const stored = storedPrices[ticker];
        if (live && stored) {
          merged[ticker] = {
            name: stored.name,
            price: live.price,
            change_pct: live.change_pct,
          };
        } else if (stored) {
          merged[ticker] = stored;
        }
      }
      setLivePrices(merged);
      setLiveFetchedAt(data.fetchedAt);
    } catch {
      // Silently fall back to stored prices
    } finally {
      setIsRefreshing(false);
    }
  }, [tickers, storedPrices]);

  useEffect(() => {
    if (isMarketOpen) {
      fetchLive();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMarketOpen]);

  const prices = livePrices ?? storedPrices;
  const fetchedAt = liveFetchedAt ?? storedFetchedAt;
  const isLive = isMarketOpen && livePrices !== null;

  return (
    <section className="glass-card overflow-hidden animate-in order-2 lg:order-1">
      <ShowMore
        maxHeight="max-h-[300px]"
        remaining={marketRows > 5 ? marketRows - 5 : undefined}
      >
        <MarketTable
          prices={prices}
          fetchedAt={fetchedAt}
          onRefresh={isMarketOpen ? fetchLive : undefined}
          isRefreshing={isRefreshing}
          isLive={isLive}
        />
      </ShowMore>
    </section>
  );
}
