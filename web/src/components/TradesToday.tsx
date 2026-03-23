"use client";

import { useState } from "react";
import type { InvestorDetail, MarketPrice } from "@/lib/data";
import { krw } from "@/lib/format";
import InvestorAvatar, { investorIdByName } from "./InvestorAvatar";

interface TradeRow {
  investor: string;
  investorId: string;
  type: "buy" | "sell";
  name: string;
  ticker: string;
  shares: number;
  price: number;
  amount: number;
}

type SortKey = "investor" | "type" | "name" | "shares" | "price" | "amount";

const ROW_HEIGHT = 37;
const VISIBLE_ROWS = 8;
const MAX_BODY_HEIGHT = ROW_HEIGHT * VISIBLE_ROWS;

interface Props {
  investorDetails: Record<string, InvestorDetail>;
  marketPrices: Record<string, MarketPrice>;
}

export default function TradesToday({ investorDetails, marketPrices }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("investor");
  const [sortDesc, setSortDesc] = useState(false);

  const rows: TradeRow[] = [];
  for (const [name, detail] of Object.entries(investorDetails)) {
    if (!detail.trades_today || detail.trades_today.length === 0) continue;
    const id = investorIdByName(name) ?? "";
    for (const t of detail.trades_today) {
      rows.push({
        investor: name,
        investorId: id,
        type: t.type as "buy" | "sell",
        name: marketPrices[t.ticker]?.name || t.ticker,
        ticker: t.ticker,
        shares: t.shares,
        price: t.price,
        amount: t.shares * t.price,
      });
    }
  }

  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "number" && typeof bv === "number") {
      return sortDesc ? bv - av : av - bv;
    }
    const as = String(av);
    const bs = String(bv);
    return sortDesc ? bs.localeCompare(as, "ko") : as.localeCompare(bs, "ko");
  });

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(key !== "investor" && key !== "type" && key !== "name");
    }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return <span className="text-gray-600 ml-0.5">↕</span>;
    return <span className="text-gray-300 ml-0.5">{sortDesc ? "↓" : "↑"}</span>;
  }

  const traders = new Set(rows.map((r) => r.investor)).size;
  const thBase = "py-2.5 px-2 sm:px-3 md:py-3 md:px-4 whitespace-nowrap cursor-pointer select-none hover:text-gray-200 transition-colors";

  return (
    <section className="glass-card overflow-hidden animate-in">
      <div className="py-3 px-4 border-b border-white/5 flex items-center gap-2">
        <h2 className="text-lg font-bold section-header">오늘의 매매</h2>
        <span className="text-xs font-normal bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">
          {traders}명 · {rows.length}건
        </span>
      </div>
      <div className="overflow-x-auto">
        {/* 헤더 — 스크롤 영역 밖에 고정 */}
        <table className="w-full text-xs sm:text-sm table-fixed">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[12%]" />
            <col className="w-[22%]" />
            <col className="w-[12%]" />
            <col className="w-[16%] hidden sm:table-column" />
            <col className="w-[16%] hidden sm:table-column" />
          </colgroup>
          <thead>
            <tr className="border-b border-white/10 text-gray-400 text-xs uppercase tracking-wider">
              <th className={`${thBase} text-left`} onClick={() => handleSort("investor")}>
                투자자{sortArrow("investor")}
              </th>
              <th className={`${thBase} text-left`} onClick={() => handleSort("type")}>
                구분{sortArrow("type")}
              </th>
              <th className={`${thBase} text-left`} onClick={() => handleSort("name")}>
                종목{sortArrow("name")}
              </th>
              <th className={`${thBase} text-right`} onClick={() => handleSort("shares")}>
                수량{sortArrow("shares")}
              </th>
              <th className={`${thBase} text-right hidden sm:table-cell`} onClick={() => handleSort("price")}>
                체결가{sortArrow("price")}
              </th>
              <th className={`${thBase} text-right hidden sm:table-cell`} onClick={() => handleSort("amount")}>
                금액{sortArrow("amount")}
              </th>
            </tr>
          </thead>
        </table>
        {/* 바디 — 스크롤 영역 */}
        <div className="overflow-y-auto" style={{ maxHeight: MAX_BODY_HEIGHT }}>
          <table className="w-full text-xs sm:text-sm table-fixed">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[12%]" />
              <col className="w-[22%]" />
              <col className="w-[12%]" />
              <col className="w-[16%] hidden sm:table-column" />
              <col className="w-[16%] hidden sm:table-column" />
            </colgroup>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={i} className="border-b border-white/5 table-row-hover">
                  <td className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 whitespace-nowrap overflow-hidden text-ellipsis">
                    <span className="inline-flex items-center gap-1.5">
                      {r.investorId && <InvestorAvatar investorId={r.investorId} size="sm" />}
                      <span className="font-medium">{r.investor}</span>
                    </span>
                  </td>
                  <td className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 whitespace-nowrap">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                        r.type === "buy"
                          ? "bg-red-500/15 text-red-400"
                          : "bg-blue-500/15 text-blue-400"
                      }`}
                    >
                      {r.type === "buy" ? "매수" : "매도"}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 whitespace-nowrap overflow-hidden text-ellipsis text-gray-300">
                    {r.name}
                  </td>
                  <td className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 whitespace-nowrap text-right tabular-nums">
                    {r.shares}주
                  </td>
                  <td className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 whitespace-nowrap text-right tabular-nums text-gray-400 hidden sm:table-cell">
                    {krw(r.price)}
                  </td>
                  <td className="py-2.5 px-2 sm:px-3 md:py-3 md:px-4 whitespace-nowrap text-right tabular-nums text-gray-400 hidden sm:table-cell">
                    {krw(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
