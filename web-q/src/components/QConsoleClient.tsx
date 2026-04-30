"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import StatusBanner from "./StatusBanner";
import HoldingCard from "./HoldingCard";
import TodayTradesTable, { type TodayTrade } from "./TodayTradesTable";
import SummaryCards from "./SummaryCards";
import {
  CACHE_TTL_OPEN_MS,
  CACHE_TTL_CLOSED_MS,
  checkMarketOpen,
  canFetchPrices,
} from "@/lib/market-hours";

interface StatusResponse {
  status: "HOLDING" | "IDLE" | "MARKET_CLOSED";
  market_open: boolean;
  can_fetch: boolean;
  holding: {
    ticker: string;
    name: string;
    shares: number;
    buy_price: number;
    buy_at_kst: string | null;
    current_price: number | null;
    pnl_pct: number | null;
    pnl_amount: number | null;
    forced_exit_at: string | null;
  } | null;
  today_trades: TodayTrade[];
  today_summary: {
    total_trades: number;
    win_count: number;
    loss_count: number;
    forced_count: number;
    pnl_amount: number;
    return_pct: number;
  };
  cumulative: {
    total_asset: number;
    cash: number;
    initial_capital: number;
    return_pct: number;
  };
  fetched_at: string;
}

interface Props {
  initial: StatusResponse;
}

export default function QConsoleClient({ initial }: Props) {
  const [data, setData] = useState<StatusResponse>(initial);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastFetchRef = useRef<number>(Date.now());

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) return;
      const json: StatusResponse = await res.json();
      setData(json);
      lastFetchRef.current = Date.now();
    } catch {
      // silently fail
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!canFetchPrices()) return;
      const ttl = checkMarketOpen() ? CACHE_TTL_OPEN_MS : CACHE_TTL_CLOSED_MS;
      if (Date.now() - lastFetchRef.current >= ttl) {
        refresh();
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex justify-end">
        <button
          onClick={refresh}
          disabled={isRefreshing}
          className="text-xs px-3 py-1.5 rounded-md border border-white/10 bg-white/[0.02] hover:bg-white/5 disabled:opacity-50 transition-colors"
        >
          {isRefreshing ? "새로고침 중..." : "↻ 새로고침"}
        </button>
      </div>

      <StatusBanner
        status={data.status}
        holdingName={data.holding?.name}
        fetchedAt={data.fetched_at}
      />

      {data.holding && <HoldingCard holding={data.holding} />}

      <SummaryCards
        todaySummary={data.today_summary}
        cumulative={data.cumulative}
      />

      <div>
        <h2 className="text-lg font-bold mb-3">오늘 매매 이력</h2>
        <TodayTradesTable trades={data.today_trades} />
      </div>
    </div>
  );
}
