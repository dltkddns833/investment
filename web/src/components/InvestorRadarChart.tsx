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
import { PerformanceStats } from "@/lib/data";
import { getInvestorHex, investorIdByName } from "@/lib/investor-colors";

interface Props {
  stats: PerformanceStats[];
  investorIds: Record<string, string>;
}

const METRICS = [
  { key: "sharpe", label: "샤프비율", higherBetter: true },
  { key: "mddDefense", label: "MDD방어", higherBetter: true },
  { key: "stability", label: "안정성", higherBetter: true },
  { key: "alpha", label: "알파", higherBetter: true },
  { key: "winRate", label: "승률", higherBetter: true },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

interface NormalizedEntry {
  metric: string;
  [investor: string]: number | string;
}

function normalize(values: number[], higherBetter: boolean): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return values.map(() => 50);
  return values.map((v) =>
    higherBetter ? ((v - min) / range) * 100 : 100 - ((v - min) / range) * 100
  );
}

export default function InvestorRadarChart({ stats, investorIds }: Props) {
  // 기본: 샤프비율 기준 상위 5명
  const defaultVisible = new Set(
    [...stats]
      .filter((s) => s.sharpeRatio !== null)
      .sort((a, b) => (b.sharpeRatio ?? 0) - (a.sharpeRatio ?? 0))
      .slice(0, 5)
      .map((s) => s.investor)
  );

  const [visible, setVisible] = useState<Set<string>>(defaultVisible);

  function toggleInvestor(name: string) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        if (next.size <= 1) return prev; // 최소 1명 유지
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  // 각 지표별 원본값 추출 (null은 중앙값으로 대체)
  const rawValues: Record<MetricKey, number[]> = {
    sharpe: stats.map((s) => s.sharpeRatio ?? 0),
    mddDefense: stats.map((s) => -(s.mdd ?? 0)),     // MDD는 음수이므로 부호 반전
    stability: stats.map((s) => -(s.volatility ?? 0)), // 변동성도 낮을수록 좋음
    alpha: stats.map((s) => s.alpha ?? 0),
    winRate: stats.map((s) => s.winRate ?? 50),
  };

  // 각 지표 정규화 (0~100)
  const normalizedValues: Record<MetricKey, number[]> = {
    sharpe: normalize(rawValues.sharpe, true),
    mddDefense: normalize(rawValues.mddDefense, true),
    stability: normalize(rawValues.stability, true),
    alpha: normalize(rawValues.alpha, true),
    winRate: normalize(rawValues.winRate, true),
  };

  // recharts 데이터 포맷
  const chartData: NormalizedEntry[] = METRICS.map((m, _mi) => {
    const entry: NormalizedEntry = { metric: m.label };
    stats.forEach((s, i) => {
      entry[s.investor] = normalizedValues[m.key][i];
    });
    return entry;
  });

  const visibleInvestors = stats.filter((s) => visible.has(s.investor));

  function getId(name: string): string {
    return investorIds[name] ?? investorIdByName(name) ?? "E";
  }

  return (
    <div className="space-y-4">
      {/* Legend / 토글 버튼 */}
      <div className="flex flex-wrap gap-2">
        {stats.map((s) => {
          const id = getId(s.investor);
          const hex = getInvestorHex(id);
          const isVisible = visible.has(s.investor);
          return (
            <button
              key={s.investor}
              onClick={() => toggleInvestor(s.investor)}
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
              {s.investor}
            </button>
          );
        })}
      </div>

      {/* 레이더 차트 */}
      <div className="h-72 md:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={chartData} outerRadius="70%">
            <PolarGrid stroke="#374151" />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fill: "#9ca3af", fontSize: 12 }}
            />
            {visibleInvestors.map((s) => {
              const hex = getInvestorHex(getId(s.investor));
              return (
                <Radar
                  key={s.investor}
                  name={s.investor}
                  dataKey={s.investor}
                  stroke={hex}
                  fill={hex}
                  fillOpacity={0.08}
                  strokeWidth={1.5}
                />
              );
            })}
            <Tooltip
              wrapperStyle={{ zIndex: 10 }}
              contentStyle={{
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value, name) => [
                typeof value === "number" ? `${value.toFixed(0)}점` : String(value),
                name as string,
              ]}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-gray-500 text-center">
        각 축은 전체 투자자 대비 상대 점수 (0~100). 레전드 클릭으로 투자자 표시/숨기기.
      </p>
    </div>
  );
}
