"use client";

import { useState, useEffect, useDeferredValue } from "react";
import Link from "next/link";
import { signColor } from "@/lib/format";
import { useLivePrices } from "@/lib/live-prices";

interface StockRow {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  change_pct: number;
  holders: number;
}

interface Props {
  stocks: StockRow[];
  title: string;
  count: number;
}

type SortKey = "price" | "change_pct" | "holders";
type SortDir = "asc" | "desc";

export default function LiveStockList({ stocks, title, count }: Props) {
  const { prices: livePrices, isLive, isClosingPrice } = useLivePrices();
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

  const rows = stocks.map((s) => {
    const live = livePrices?.[s.ticker];
    if ((isLive || isClosingPrice) && live) {
      return { ...s, price: live.price, change_pct: live.change_pct };
    }
    return s;
  }).sort((a, b) => {
    const mul = sortDir === "desc" ? 1 : -1;
    return mul * (b[sortKey] - a[sortKey]);
  });

  const q = debouncedQuery.trim().toLowerCase();
  const filtered = q
    ? rows.filter((s) => s.name.toLowerCase().includes(q) || s.ticker.toLowerCase().includes(q))
    : rows;

  return (
    <div className="overflow-x-auto">
      <div className="py-4 px-4 border-b border-white/5 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold section-header shrink-0">
          {title}
          <span className="text-sm font-normal text-gray-400 ml-2">
            {count}종목
          </span>
        </h2>
        <input
          type="text"
          placeholder="종목명 또는 티커 검색..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full sm:max-w-xs px-3 py-1.5 bg-slate-800 border border-white/10 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
        />
      </div>
      <table className="w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="border-b border-white/5 text-gray-500 text-xs">
            <th className="text-left py-2.5 px-2 sm:px-4">종목</th>
            <th className="text-left py-2.5 px-2 sm:px-4 hidden sm:table-cell">섹터</th>
            <th className="text-right py-2.5 px-2 sm:px-4 cursor-pointer select-none hover:text-gray-200 transition-colors" onClick={() => toggleSort("price")}>현재가 {sortArrow("price")}</th>
            <th className="text-right py-2.5 px-2 sm:px-4 cursor-pointer select-none hover:text-gray-200 transition-colors" onClick={() => toggleSort("change_pct")}>등락률 {sortArrow("change_pct")}</th>
            <th className="text-right py-2.5 px-2 sm:px-4 hidden sm:table-cell cursor-pointer select-none hover:text-gray-200 transition-colors" onClick={() => toggleSort("holders")}>보유 {sortArrow("holders")}</th>
          </tr>
        </thead>
        <tbody className={`transition-opacity duration-150 ${isStale ? "opacity-50" : "opacity-100"}`}>
          {filtered.map((s) => (
            <tr
              key={s.ticker}
              className="border-b border-white/5 hover:bg-white/[0.02]"
            >
              <td className="py-2.5 px-2 sm:px-4">
                <Link
                  href={`/stocks/${s.ticker}`}
                  className="font-medium hover:text-blue-400 transition-colors"
                >
                  {s.name}
                </Link>
              </td>
              <td className="py-2.5 px-2 sm:px-4 text-gray-400 hidden sm:table-cell">
                {s.sector}
              </td>
              <td className="py-2.5 px-2 sm:px-4 text-right tabular-nums">
                {s.price.toLocaleString()}
              </td>
              <td
                className={`py-2.5 px-2 sm:px-4 text-right tabular-nums font-medium ${signColor(s.change_pct)}`}
              >
                {s.change_pct > 0 ? "+" : ""}
                {s.change_pct.toFixed(2)}%
              </td>
              <td className="py-2.5 px-2 sm:px-4 text-right text-gray-400 hidden sm:table-cell">
                {s.holders > 0 ? `${s.holders}명` : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
