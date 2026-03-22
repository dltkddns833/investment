"use client";

import { useState } from "react";
import Link from "next/link";
import type { RegimePerformance, RegimeInvestorPerformance } from "@/lib/regime-analysis";
import { signColor } from "@/lib/format";
import InvestorAvatar from "@/components/InvestorAvatar";

interface Props {
  performances: RegimePerformance[];
}

type SortKey = "bull" | "neutral" | "bear";

function fmtRegime(data: RegimeInvestorPerformance | null): string {
  if (!data) return "-";
  return `${data.returnPct >= 0 ? "+" : ""}${data.returnPct.toFixed(2)}%`;
}

function getRegimeColor(data: RegimeInvestorPerformance | null): string {
  if (!data) return "text-gray-600";
  return signColor(data.returnPct);
}

export default function RegimePerformanceTable({ performances }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("bull");
  const [sortDesc, setSortDesc] = useState(true);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  const sorted = [...performances].sort((a, b) => {
    const av = a[sortKey]?.returnPct ?? (sortDesc ? -Infinity : Infinity);
    const bv = b[sortKey]?.returnPct ?? (sortDesc ? -Infinity : Infinity);
    return sortDesc ? bv - av : av - bv;
  });

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return <span className="text-gray-600 ml-0.5">↕</span>;
    return <span className="text-gray-300 ml-0.5">{sortDesc ? "↓" : "↑"}</span>;
  }

  const thClass =
    "px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none whitespace-nowrap";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">투자자</th>
            <th className={thClass} onClick={() => handleSort("bull")}>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-green-500 inline-block" />
                강세장 {sortArrow("bull")}
              </span>
            </th>
            <th className={thClass} onClick={() => handleSort("neutral")}>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-gray-500 inline-block" />
                중립장 {sortArrow("neutral")}
              </span>
            </th>
            <th className={thClass} onClick={() => handleSort("bear")}>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-red-500 inline-block" />
                약세장 {sortArrow("bear")}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.investorId} className="border-b border-gray-800/50 hover:bg-white/5">
              <td className="px-3 py-2">
                <Link
                  href={`/investors/${p.investorId}`}
                  className="flex items-center gap-2 hover:underline"
                >
                  <InvestorAvatar investorId={p.investorId} size="sm" />
                  <span className="font-medium">{p.investor}</span>
                </Link>
              </td>
              <td className={`px-3 py-2 tabular-nums ${getRegimeColor(p.bull)}`}>
                {fmtRegime(p.bull)}
                {p.bull && (
                  <span className="text-gray-600 text-xs ml-1">({p.bull.days}일)</span>
                )}
              </td>
              <td className={`px-3 py-2 tabular-nums ${getRegimeColor(p.neutral)}`}>
                {fmtRegime(p.neutral)}
                {p.neutral && (
                  <span className="text-gray-600 text-xs ml-1">({p.neutral.days}일)</span>
                )}
              </td>
              <td className={`px-3 py-2 tabular-nums ${getRegimeColor(p.bear)}`}>
                {fmtRegime(p.bear)}
                {p.bear && (
                  <span className="text-gray-600 text-xs ml-1">({p.bear.days}일)</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
