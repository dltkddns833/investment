"use client";

import { useState } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { InvestorScorecard } from "@/lib/scorecard";
import { CATEGORY_KEYS, CATEGORY_LABELS } from "@/lib/scorecard";
import { getInvestorHex } from "@/lib/investor-colors";

interface Props {
  scorecards: InvestorScorecard[];
}

interface ChartEntry {
  category: string;
  [investor: string]: number | string;
}

export default function ScorecardRadarChart({ scorecards }: Props) {
  // Default: show top 3 recommended
  const defaultVisible = new Set(
    scorecards.filter((sc) => sc.recommended).map((sc) => sc.investor)
  );

  const [visible, setVisible] = useState<Set<string>>(defaultVisible);

  function toggleInvestor(name: string) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        if (next.size <= 1) return prev;
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  const chartData: ChartEntry[] = CATEGORY_KEYS.map((key) => {
    const entry: ChartEntry = { category: CATEGORY_LABELS[key] };
    for (const sc of scorecards) {
      entry[sc.investor] = sc.categories[key].score;
    }
    return entry;
  });

  const visibleScorecards = scorecards.filter((sc) =>
    visible.has(sc.investor)
  );

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {scorecards.map((sc) => {
          const hex = getInvestorHex(sc.investorId);
          const isVisible = visible.has(sc.investor);
          return (
            <button
              key={sc.investorId}
              onClick={() => toggleInvestor(sc.investor)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                isVisible ? "opacity-100" : "opacity-30"
              }`}
              style={{
                border: `1px solid ${hex}`,
                background: isVisible ? `${hex}20` : "transparent",
                color: hex,
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: hex }}
              />
              {sc.investor}
              {sc.recommended && " ★"}
            </button>
          );
        })}
      </div>

      {/* Radar chart */}
      <div className="h-72 md:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={chartData} outerRadius="70%">
            <PolarGrid stroke="#374151" />
            <PolarAngleAxis
              dataKey="category"
              tick={{ fill: "#9ca3af", fontSize: 12 }}
            />
            {visibleScorecards.map((sc) => {
              const hex = getInvestorHex(sc.investorId);
              return (
                <Radar
                  key={sc.investorId}
                  name={sc.investor}
                  dataKey={sc.investor}
                  stroke={hex}
                  fill={hex}
                  fillOpacity={0.08}
                  strokeWidth={1.5}
                />
              );
            })}
            <Tooltip
              cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
              wrapperStyle={{ zIndex: 10 }}
              contentStyle={{
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "8px",
                fontSize: "12px",
                color: "#e2e8f0",
              }}
              formatter={(value, name) => [
                typeof value === "number"
                  ? `${value.toFixed(1)}점`
                  : String(value),
                name as string,
              ]}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-gray-500 text-center">
        6개 카테고리별 상대 점수 (0~100). ★ 표시는 실전 추천 투자자. 레전드
        클릭으로 표시/숨기기.
      </p>
    </div>
  );
}
