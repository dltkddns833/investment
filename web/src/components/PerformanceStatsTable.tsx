"use client";

import { useState } from "react";
import Link from "next/link";
import { PerformanceStats } from "@/lib/data";
import { pct, signColor } from "@/lib/format";
import InvestorAvatar from "@/components/InvestorAvatar";
import TooltipIcon from "@/components/TooltipIcon";

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
              <span className="inline-flex items-center gap-1">
                샤프비율 {sortArrow("sharpeRatio")}
                <TooltipIcon text="위험 대비 수익 효율. 높을수록 같은 리스크에서 더 많은 수익을 냈다는 의미." />
              </span>
            </th>
            <th className={thClass} onClick={() => handleSort("mdd")}>
              <span className="inline-flex items-center gap-1">
                MDD {sortArrow("mdd")}
                <TooltipIcon text="최대 낙폭(Max Drawdown). 고점 대비 최대 하락폭으로, 최악의 손실 구간을 나타냄." />
              </span>
            </th>
            <th className={thClass} onClick={() => handleSort("winRate")}>
              <span className="inline-flex items-center gap-1">
                승률 {sortArrow("winRate")}
                <TooltipIcon text="매도 거래 중 수익을 낸 비율. 높을수록 수익 실현 빈도가 높다는 의미." />
              </span>
            </th>
            <th className={`${thClass} hidden md:table-cell`} onClick={() => handleSort("volatility")}>
              <span className="inline-flex items-center gap-1">
                변동성 {sortArrow("volatility")}
                <TooltipIcon text="수익률의 변동 정도(연환산). 낮을수록 안정적인 투자 성과를 의미." />
              </span>
            </th>
            <th className={`${thClass} hidden md:table-cell`} onClick={() => handleSort("alpha")}>
              <span className="inline-flex items-center gap-1">
                알파 {sortArrow("alpha")}
                <TooltipIcon text="벤치마크(E 정기준) 대비 초과 수익률. 양수면 벤치마크를 이겼다는 의미." />
              </span>
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
