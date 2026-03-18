"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { MarketPrice } from "@/lib/data";
import { krw, pct } from "@/lib/format";
import { SectorIcon } from "@/lib/sector-icons";

interface Props {
  prices: Record<string, MarketPrice>;
  fetchedAt?: string;
  onRefresh?: () => void;    // deprecated, kept for compat
  isRefreshing?: boolean;    // deprecated, kept for compat
  isLive?: boolean;
  isClosingPrice?: boolean;
  sectorMap?: Record<string, string>;
}

type MarketRow = MarketPrice & { ticker: string; sector?: string };
type SortKey = "price" | "change_pct";
type SortDir = "asc" | "desc";

export default function MarketTable({
  prices,
  fetchedAt,
  onRefresh,
  isRefreshing,
  isLive,
  isClosingPrice,
  sectorMap,
}: Props) {
  const hasSector = !!sectorMap && Object.keys(sectorMap).length > 0;
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("change_pct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const isStale = query !== debouncedQuery;

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(id);
  }, [query]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return <span className="text-gray-600 ml-0.5">↕</span>;
    return <span className="text-gray-300 ml-0.5">{sortDir === "desc" ? "↓" : "↑"}</span>;
  }

  const allData: MarketRow[] = Object.entries(prices)
    .map(([ticker, p]) => ({ ...p, ticker, sector: sectorMap?.[ticker] }))
    .sort((a, b) => {
      const mul = sortDir === "desc" ? 1 : -1;
      return mul * (b[sortKey] - a[sortKey]);
    });

  const q = debouncedQuery.trim().toLowerCase();
  const data = q
    ? allData.filter((r) => r.name.toLowerCase().includes(q) || r.ticker.toLowerCase().includes(q))
    : allData;

  const timeStr = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Seoul",
      })
    : null;

  return (
    <div className="flex flex-col h-full">
      <div className="py-4 px-4 border-b border-white/5 flex items-center justify-between shrink-0">
        <h2 className="text-xl font-bold section-header flex items-center gap-2">
          시장 현황
          {isLive && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
              </span>
              LIVE
            </span>
          )}
          {!isLive && isClosingPrice && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <span className="inline-flex rounded-full h-1.5 w-1.5 bg-amber-400" />
              종가
            </span>
          )}
        </h2>
        <div className="flex items-center">
          <input
            type="text"
            placeholder="종목 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-32 sm:w-40 px-2.5 py-1 bg-slate-800 border border-white/10 rounded-lg text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
          />
        </div>
      </div>
      <table className="w-full text-xs sm:text-sm shrink-0" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "40%" }} />
          {hasSector && <col className="hidden sm:table-column" style={{ width: "25%" }} />}
          <col style={{ width: hasSector ? "17.5%" : "30%" }} />
          <col style={{ width: hasSector ? "17.5%" : "30%" }} />
        </colgroup>
        <thead>
          <tr className="border-b border-white/10 text-gray-400 text-xs uppercase tracking-wider">
            <th className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 text-left whitespace-nowrap">종목</th>
            {hasSector && <th className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 text-left whitespace-nowrap hidden sm:table-cell">섹터</th>}
            <th className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 text-right whitespace-nowrap cursor-pointer select-none hover:text-gray-200 transition-colors" onClick={() => toggleSort("price")}>현재가 {sortArrow("price")}</th>
            <th className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 text-right whitespace-nowrap cursor-pointer select-none hover:text-gray-200 transition-colors" onClick={() => toggleSort("change_pct")}>등락률 {sortArrow("change_pct")}</th>
          </tr>
        </thead>
      </table>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-xs sm:text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "40%" }} />
            {hasSector && <col className="hidden sm:table-column" style={{ width: "25%" }} />}
            <col style={{ width: hasSector ? "17.5%" : "30%" }} />
            <col style={{ width: hasSector ? "17.5%" : "30%" }} />
          </colgroup>
          <tbody className={`transition-opacity duration-150 ${isStale ? "opacity-50" : "opacity-100"}`}>
            {data.map((row) => {
              const changeCls =
                row.change_pct > 0
                  ? "bg-red-500/10 text-red-400"
                  : row.change_pct < 0
                    ? "bg-blue-500/10 text-blue-400"
                    : "bg-gray-500/10 text-gray-400";
              return (
                <tr key={row.ticker} className="border-b border-white/5 table-row-hover">
                  <td className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 whitespace-nowrap">
                    <Link href={`/stocks/${row.ticker}`} className="block hover:text-blue-400 transition-colors">
                      <div className="font-medium">{row.name}</div>
                    </Link>
                  </td>
                  {hasSector && (
                    <td className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 whitespace-nowrap hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1 text-gray-400">
                        <SectorIcon sector={row.sector ?? ""} className="w-3 h-3 text-gray-500" />
                        {row.sector}
                      </span>
                    </td>
                  )}
                  <td className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 whitespace-nowrap text-right">
                    <span className="font-mono tabular-nums">{krw(row.price)}</span>
                  </td>
                  <td className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 whitespace-nowrap text-right">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold font-mono tabular-nums ${changeCls}`}>
                      {pct(row.change_pct)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
