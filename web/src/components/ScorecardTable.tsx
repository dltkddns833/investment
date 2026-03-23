"use client";

import { useState } from "react";
import Link from "next/link";
import type { InvestorScorecard, CategoryKey } from "@/lib/scorecard";
import { CATEGORY_LABELS, CATEGORY_KEYS } from "@/lib/scorecard";
import InvestorAvatar from "@/components/InvestorAvatar";
import TooltipIcon from "@/components/TooltipIcon";

type SortKey = "totalScore" | CategoryKey;

interface Props {
  scorecards: InvestorScorecard[];
}

const CATEGORY_TOOLTIPS: Record<string, string> = {
  profitability: "누적 수익률 기반 점수. 높을수록 더 많은 수익을 냈다는 의미.",
  riskAdjusted:
    "샤프비율(70%)과 소르티노비율(30%) 가중합. 위험 대비 수익 효율.",
  defense: "최대낙폭(60%)과 최대연속손실일(40%). 하락장 방어력.",
  consistency: "월간 수익 편차(60%)와 승률(40%). 안정적 수익 창출 능력.",
  efficiency: "회전율(60%)과 거래비용비중(40%). 낮을수록 효율적.",
  validation: "백테스트 vs 라이브 수익률 괴리. 낮을수록 전략 신뢰도가 높음.",
};

function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

function scoreBg(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

export default function ScorecardTable({ scorecards }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("totalScore");
  const [sortDesc, setSortDesc] = useState(true);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  const sorted = [...scorecards].sort((a, b) => {
    const av =
      sortKey === "totalScore"
        ? a.totalScore
        : a.categories[sortKey as CategoryKey].score;
    const bv =
      sortKey === "totalScore"
        ? b.totalScore
        : b.categories[sortKey as CategoryKey].score;
    return sortDesc ? bv - av : av - bv;
  });

  function sortArrow(key: SortKey) {
    if (sortKey !== key)
      return <span className="text-gray-600 ml-0.5">↕</span>;
    return (
      <span className="text-gray-300 ml-0.5">{sortDesc ? "↓" : "↑"}</span>
    );
  }

  const thClass =
    "px-2 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white select-none whitespace-nowrap";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 w-8">
              #
            </th>
            <th className="px-2 py-2 text-left text-xs font-medium text-gray-400">
              투자자
            </th>
            <th
              className={thClass}
              onClick={() => handleSort("totalScore")}
            >
              <span className="inline-flex items-center gap-1">
                종합 {sortArrow("totalScore")}
              </span>
            </th>
            {CATEGORY_KEYS.map((key) => (
              <th
                key={key}
                className={`${thClass} ${
                  key === "efficiency" || key === "validation"
                    ? "hidden lg:table-cell"
                    : key === "consistency"
                    ? "hidden md:table-cell"
                    : ""
                }`}
                onClick={() => handleSort(key)}
              >
                <span className="inline-flex items-center gap-1">
                  {CATEGORY_LABELS[key]} {sortArrow(key)}
                  <TooltipIcon text={CATEGORY_TOOLTIPS[key]} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {sorted.map((sc) => (
            <tr
              key={sc.investorId}
              className="hover:bg-white/5 transition-colors"
            >
              <td className="px-2 py-2.5 text-gray-500 font-mono text-xs">
                {sc.rank}
              </td>
              <td className="px-2 py-2.5">
                <Link
                  href={`/investors/${sc.investorId}`}
                  className="flex items-center gap-2 hover:underline"
                >
                  <InvestorAvatar investorId={sc.investorId} size="sm" />
                  <span className="font-medium">{sc.investor}</span>
                  {sc.recommended && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-semibold"
                      title="실전 추천"
                    >
                      추천
                    </span>
                  )}
                </Link>
              </td>
              <td className="px-2 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${scoreBg(sc.totalScore)}`}
                      style={{ width: `${sc.totalScore}%` }}
                    />
                  </div>
                  <span
                    className={`font-mono text-xs font-semibold ${scoreColor(sc.totalScore)}`}
                  >
                    {sc.totalScore.toFixed(1)}
                  </span>
                </div>
              </td>
              {CATEGORY_KEYS.map((key) => {
                const cat = sc.categories[key];
                return (
                  <td
                    key={key}
                    className={`px-2 py-2.5 font-mono text-xs ${scoreColor(cat.score)} ${
                      key === "efficiency" || key === "validation"
                        ? "hidden lg:table-cell"
                        : key === "consistency"
                        ? "hidden md:table-cell"
                        : ""
                    }`}
                  >
                    {cat.score.toFixed(1)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
