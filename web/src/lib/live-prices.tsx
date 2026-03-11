"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

interface LivePriceData {
  price: number;
  change_pct: number;
}

interface LivePriceContextType {
  /** Live prices (ticker → price/change). null if not fetched yet */
  prices: Record<string, LivePriceData> | null;
  fetchedAt: string | null;
  /** Whether live data is currently active */
  isLive: boolean;
  /** Whether the Korean market is currently open */
  isMarketOpen: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const LivePriceContext = createContext<LivePriceContextType>({
  prices: null,
  fetchedAt: null,
  isLive: false,
  isMarketOpen: false,
  isRefreshing: false,
  refresh: async () => {},
});

function checkMarketOpen(): boolean {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  return t >= 540 && t < 960; // 09:00 ~ 16:00
}

export function LivePriceProvider({
  tickers,
  children,
}: {
  tickers: string[];
  children: ReactNode;
}) {
  const [prices, setPrices] = useState<Record<string, LivePriceData> | null>(
    null
  );
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMarketOpen, setIsMarketOpen] = useState(false);
  const lastFetchRef = useRef<number>(0);

  // Check market status periodically
  useEffect(() => {
    setIsMarketOpen(checkMarketOpen());
    const interval = setInterval(() => {
      setIsMarketOpen(checkMarketOpen());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const refresh = useCallback(async () => {
    if (tickers.length === 0) return;
    setIsRefreshing(true);
    try {
      const res = await fetch(
        `/api/live-prices?tickers=${tickers.join(",")}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setPrices(data.prices);
      setFetchedAt(data.fetchedAt);
      lastFetchRef.current = Date.now();
    } catch {
      // silently fail, keep previous data
    } finally {
      setIsRefreshing(false);
    }
  }, [tickers]);

  // Auto-fetch on mount or when market opens, respect cache TTL
  useEffect(() => {
    if (!isMarketOpen) return;
    const age = Date.now() - lastFetchRef.current;
    if (age >= CACHE_TTL_MS) {
      refresh();
    }
  }, [isMarketOpen, refresh]);

  const isLive = isMarketOpen && prices !== null;

  return (
    <LivePriceContext.Provider
      value={{ prices, fetchedAt, isLive, isMarketOpen, isRefreshing, refresh }}
    >
      {children}
    </LivePriceContext.Provider>
  );
}

export function useLivePrices() {
  return useContext(LivePriceContext);
}
