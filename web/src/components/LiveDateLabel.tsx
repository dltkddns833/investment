"use client";

import { useLivePrices } from "@/lib/live-prices";

interface Props {
  storedDate: string;
}

export default function LiveDateLabel({ storedDate }: Props) {
  const { fetchedAt, isLive } = useLivePrices();

  if (isLive && fetchedAt) {
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
      <p className="text-gray-400 mt-1">
        {today} {time} 기준
      </p>
    );
  }

  return <p className="text-gray-400 mt-1">{storedDate} 기준</p>;
}
