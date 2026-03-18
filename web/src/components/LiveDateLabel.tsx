"use client";

import { useLivePrices } from "@/lib/live-prices";

interface Props {
  storedDate: string;
}

export default function LiveDateLabel({ storedDate }: Props) {
  const { fetchedAt, isLive, isMarketOpen, isClosingPrice, isRefreshing, refresh } = useLivePrices();

  const refreshButton = (isMarketOpen || isClosingPrice) ? (
    <button
      onClick={refresh}
      disabled={isRefreshing}
      className="flex items-center ml-1.5 p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
      aria-label="새로고침"
    >
      <svg
        className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    </button>
  ) : null;

  if ((isLive || isClosingPrice) && fetchedAt) {
    const time = new Date(fetchedAt).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Seoul",
    });
    const today = new Date().toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Seoul",
    });
    return (
      <p className="text-gray-400 mt-1 flex items-center">
        {today} {time} 기준{isClosingPrice ? " (종가)" : ""}
        {refreshButton}
      </p>
    );
  }

  return (
    <p className="text-gray-400 mt-1 flex items-center">
      {storedDate} 기준
      {refreshButton}
    </p>
  );
}
