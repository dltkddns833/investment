"use client";

import { useState } from "react";
import Link from "next/link";
import { PerformanceStats } from "@/lib/data";
import { pct, signColor } from "@/lib/format";
import InvestorAvatar from "@/components/InvestorAvatar";

type SortKey = "sharpeRatio" | "mdd" | "volatility" | "alpha" | "winRate" | "totalReturnPct";

interface Props {
  stats: PerformanceStats[];
  investorIds: Record<string, string>;
}

function fmt(value: number | null, decimals = 2): string {
  if (value === null) return "-";
  return value.toFixed(decimals);
}

function fmtPct(value: number | null): string {
  if (value === null) return "-";
  return pct(value);
}

function fmtWin(value: number | null): string {
  if (value === null) return "-";
  return `${value.toFixed(1)}%`;
}

export default function PerformanceStatsTable({ stats, investorIds }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("sharpeRatio");
  const [sortDesc, setSortDesc] = useState(true);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  const sorted = [...stats].sort((a, b) => {
    const av = a[sortKey] ?? (sortDesc ? -Infinity : Infinity);
    const bv = b[sortKey] ?? (sortDesc ? -Infinity : Infinity);
    return sortDesc ? bv - av : av - bv;
  });

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return <span className="text-gray-600 ml-0.5">↕</span>;
    return <span className="text-gray-300 ml-0.5">{sortDesc ? "↓" : "↑"}</span>;
  }

  const thClass = "px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none whitespace-nowrap";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className={thClass}>투자자</th>
            <th className={thClass} onClick={() => handleSort("sharpeRatio")}>
              샤프비율 {sortArrow("sharpeRatio")}
            </th>
            <th className={thClass} onClick={() => handleSort("mdd")}>
              MDD {sortArrow("mdd")}
            </th>
            <th className={thClass} onClick={() => handleSort("winRate")}>
              승률 {sortArrow("winRate")}
            </th>
            <th className={`${thClass} hidden md:table-cell`} onClick={() => handleSort("volatility")}>
              변동성 {sortArrow("volatility")}
            </th>
            <th className={`${thClass} hidden md:table-cell`} onClick={() => handleSort("alpha")}>
              알파 {sortArrow("alpha")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {sorted.map((s) => {
            const id = investorIds[s.investor] ?? s.investorId;
            return (
              <tr key={s.investor} className="hover:bg-white/5 transition-colors">
                <td className="px-3 py-2.5">
                  <Link
                    href={`/investors/${id}`}
                    className="flex items-center gap-2 hover:underline"
                  >
                    <InvestorAvatar investorId={id} size="sm" />
                    <span className="font-medium">{s.investor}</span>
                  </Link>
                </td>
                <td className={`px-3 py-2.5 font-mono ${s.sharpeRatio !== null ? signColor(s.sharpeRatio) : "text-gray-500"}`}>
                  {fmt(s.sharpeRatio)}
                </td>
                <td className={`px-3 py-2.5 font-mono ${s.mdd !== null ? "text-blue-400" : "text-gray-500"}`}>
                  {fmtPct(s.mdd)}
                </td>
                <td className="px-3 py-2.5 font-mono text-gray-200">
                  {fmtWin(s.winRate)}
                </td>
                <td className="px-3 py-2.5 font-mono text-gray-300 hidden md:table-cell">
                  {s.volatility !== null ? `${s.volatility.toFixed(1)}%` : "-"}
                </td>
                <td className={`px-3 py-2.5 font-mono hidden md:table-cell ${s.alpha !== null ? signColor(s.alpha) : "text-gray-500"}`}>
                  {fmtPct(s.alpha)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
