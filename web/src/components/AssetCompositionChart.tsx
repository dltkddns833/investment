"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useMemo } from "react";
import type { AssetCompositionPoint } from "@/lib/data";
import { krw } from "@/lib/format";

const COLORS = [
  "#94a3b8", // cash (gray)
  "#f87171", "#60a5fa", "#34d399", "#fbbf24", "#a78bfa",
  "#f472b6", "#38bdf8", "#4ade80", "#fb923c", "#818cf8",
  "#2dd4bf", "#e879f9", "#facc15", "#22d3ee", "#f43f5e",
  "#84cc16", "#c084fc", "#fb7185", "#a3e635", "#7dd3fc",
];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}`;
}

function formatYAxis(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(0)}만`;
  return value.toLocaleString();
}

interface Props {
  data: AssetCompositionPoint[];
}

export default function AssetCompositionChart({ data }: Props) {
  // 전체 날짜에 걸쳐 등장한 종목 목록 수집 (현금 제외)
  const stockNames = useMemo(() => {
    const nameSet = new Set<string>();
    for (const point of data) {
      for (const key of Object.keys(point)) {
        if (key !== "date" && key !== "cash") nameSet.add(key);
      }
    }
    // 마지막 날짜 기준 금액 내림차순 정렬
    const last = data[data.length - 1];
    return [...nameSet].sort((a, b) => {
      const va = last ? (typeof last[a] === "number" ? (last[a] as number) : 0) : 0;
      const vb = last ? (typeof last[b] === "number" ? (last[b] as number) : 0) : 0;
      return vb - va;
    });
  }, [data]);

  // 표시할 종목 (상위 10개 + 나머지는 "기타"로 합산)
  const MAX_STOCKS = 10;
  const displayNames = stockNames.slice(0, MAX_STOCKS);
  const otherNames = stockNames.slice(MAX_STOCKS);
  const hasOther = otherNames.length > 0;

  const chartData = useMemo(() => {
    if (!hasOther) return data;
    return data.map((point) => {
      const newPoint: AssetCompositionPoint = { date: point.date, cash: point.cash };
      for (const name of displayNames) {
        newPoint[name] = (point[name] as number) ?? 0;
      }
      let otherSum = 0;
      for (const name of otherNames) {
        otherSum += ((point[name] as number) ?? 0);
      }
      if (otherSum > 0) newPoint["기타"] = otherSum;
      return newPoint;
    });
  }, [data, displayNames, otherNames, hasOther]);

  const areaKeys = ["cash", ...displayNames];
  if (hasOther) areaKeys.push("기타");

  const labelMap: Record<string, string> = { cash: "현금", "기타": "기타" };

  if (data.length === 0) return null;

  return (
    <div>
      <div className="h-[200px] md:h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            axisLine={{ stroke: "#374151" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatYAxis}
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            labelFormatter={(label) => `${label}`}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any, name: any) => [
              krw(Number(value ?? 0)),
              labelMap[name ?? ""] ?? name ?? "",
            ]}
            contentStyle={{
              background: "rgba(15, 23, 42, 0.9)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "10px",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
            }}
            itemSorter={(item) => -(item.value as number)}
          />
          {areaKeys.map((key, i) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stackId="1"
              stroke={COLORS[i % COLORS.length]}
              fill={COLORS[i % COLORS.length]}
              fillOpacity={0.6}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 px-1 mb-4">
        {areaKeys.map((key, i) => (
          <div key={key} className="flex items-center gap-1">
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span className="text-[10px] text-gray-400">
              {labelMap[key] ?? key}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
