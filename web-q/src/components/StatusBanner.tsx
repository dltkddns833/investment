"use client";

import { useEffect, useState } from "react";
import StatusFace from "./StatusFace";

interface Props {
  status: "HOLDING" | "IDLE" | "MARKET_CLOSED";
  holdingName?: string | null;
  fetchedAt?: string | null;
}

export default function StatusBanner({ status, holdingName, fetchedAt }: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  const kstTime = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  let bg = "from-slate-800/50 to-slate-900/50";
  let border = "border-slate-700/50";
  let label = "대기중";
  let sub = "거래량 폭증 후보 스캔 중";
  let pulse = false;

  if (status === "HOLDING") {
    bg = "from-yellow-500/15 to-orange-500/10";
    border = "border-yellow-500/30";
    label = `보유중 — ${holdingName ?? ""}`;
    sub = "매수+30분 강제 청산 카운트다운 진행";
    pulse = true;
  } else if (status === "MARKET_CLOSED") {
    bg = "from-slate-900/60 to-slate-950/60";
    border = "border-slate-800/60";
    label = "장 마감";
    sub = "다음 영업일 09:00 스캔 시작";
  } else {
    label = "대기중";
    sub = "거래량 ≥3배 + 등락률 ≥+5% 조건 스캔 중";
  }

  return (
    <div
      className={`rounded-2xl bg-gradient-to-br ${bg} border ${border} p-4 sm:p-6 md:p-8 ${
        pulse ? "animate-pulse-yellow" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="shrink-0">
            <StatusFace status={status} />
          </div>
          <div className="min-w-0">
            <div className="text-base sm:text-xl md:text-2xl font-bold break-keep">
              {label}
            </div>
            <div className="text-xs sm:text-sm text-gray-400 mt-0.5 sm:mt-1">
              {sub}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-xl sm:text-2xl md:text-3xl tabular-nums">
            {kstTime}
          </div>
          <div className="text-[11px] sm:text-xs text-gray-500 mt-1">
            {fetchedAt
              ? `마지막 업데이트 ${formatKstTime(fetchedAt)}`
              : "업데이트 대기"}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatKstTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
