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
  /** Whether live data is currently active (market open + prices fetched) */
  isLive: boolean;
  /** Whether the Korean market is currently open */
  isMarketOpen: boolean;
  /** Whether closing prices are available (after market close, weekday) */
  isClosingPrice: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
}

const CACHE_TTL_OPEN_MS = 3 * 60 * 1000; // 3 minutes (장중)
const CACHE_TTL_CLOSED_MS = 10 * 60 * 1000; // 10 minutes (장마감 후)

const LivePriceContext = createContext<LivePriceContextType>({
  prices: null,
  fetchedAt: null,
  isLive: false,
  isMarketOpen: false,
  isClosingPrice: false,
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
  return t >= 540 && t < 930; // 09:00 ~ 15:30
}

/** 가격 조회 가능 시간 (평일 09:00 이후 — 장중 + 장마감 후 종가) */
function canFetchPrices(): boolean {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  return t >= 540; // 09:00+
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
  const [canFetch, setCanFetch] = useState(false);
  const lastFetchRef = useRef<number>(0);

  // Check market status periodically
  useEffect(() => {
    setIsMarketOpen(checkMarketOpen());
    setCanFetch(canFetchPrices());
    const interval = setInterval(() => {
      setIsMarketOpen(checkMarketOpen());
      setCanFetch(canFetchPrices());
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

  const prevMarketOpenRef = useRef(false);

  // Auto-fetch on mount or when prices can be fetched, with periodic polling
  useEffect(() => {
    if (!canFetch) return;
    const age = Date.now() - lastFetchRef.current;
    const ttl = isMarketOpen ? CACHE_TTL_OPEN_MS : CACHE_TTL_CLOSED_MS;
    if (age >= ttl) {
      refresh();
    }

    // 장중이면 3분, 장마감 후면 10분 간격 자동 폴링
    const interval = setInterval(() => {
      const currentTtl = checkMarketOpen() ? CACHE_TTL_OPEN_MS : CACHE_TTL_CLOSED_MS;
      const elapsed = Date.now() - lastFetchRef.current;
      if (elapsed >= currentTtl) {
        refresh();
      }
    }, 60_000); // 1분마다 TTL 체크

    return () => clearInterval(interval);
  }, [canFetch, isMarketOpen, refresh]);

  // 장 시작/마감 전환 시 즉시 갱신
  useEffect(() => {
    if (prevMarketOpenRef.current !== isMarketOpen && canFetch) {
      refresh();
    }
    prevMarketOpenRef.current = isMarketOpen;
  }, [isMarketOpen, canFetch, refresh]);

  const isLive = isMarketOpen && prices !== null;
  const isClosingPrice = !isMarketOpen && canFetch && prices !== null;

  return (
    <LivePriceContext.Provider
      value={{ prices, fetchedAt, isLive, isMarketOpen, isClosingPrice, isRefreshing, refresh }}
    >
      {children}
    </LivePriceContext.Provider>
  );
}

export function useLivePrices() {
  return useContext(LivePriceContext);
}
