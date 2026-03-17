"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useMemo, useState, useCallback } from "react";
import type { AssetCompositionPoint } from "@/lib/data";
import { krw } from "@/lib/format";

const COLORS = [
  "#94a3b8", // cash (gray)
  "#ef4444", // red
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#a855f7", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#e11d48", // rose
];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}`;
}

interface Props {
  data: AssetCompositionPoint[];
}

export default function AssetCompositionChart({ data }: Props) {
  const [mode, setMode] = useState<"pct" | "amount">("pct");
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  const stockNames = useMemo(() => {
    const nameSet = new Set<string>();
    for (const point of data) {
      for (const key of Object.keys(point)) {
        if (key !== "date" && key !== "cash") nameSet.add(key);
      }
    }
    const last = data[data.length - 1];
    return [...nameSet].sort((a, b) => {
      const va = last ? (typeof last[a] === "number" ? (last[a] as number) : 0) : 0;
      const vb = last ? (typeof last[b] === "number" ? (last[b] as number) : 0) : 0;
      return vb - va;
    });
  }, [data]);

  const MAX_STOCKS = 10;
  const displayNames = stockNames.slice(0, MAX_STOCKS);
  const otherNames = stockNames.slice(MAX_STOCKS);
  const hasOther = otherNames.length > 0;

  const barKeys = useMemo(() => {
    const keys = ["cash", ...displayNames];
    if (hasOther) keys.push("기타");
    return keys;
  }, [displayNames, hasOther]);

  const labelMap: Record<string, string> = { cash: "현금", "기타": "기타" };

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    barKeys.forEach((key, i) => { map[key] = COLORS[i % COLORS.length]; });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barKeys.join(",")]);

  // 차트 데이터: 기타 합산 + 비중 모드 변환
  const chartData = useMemo(() => {
    return data.map((point) => {
      // 먼저 기타 합산
      const merged: Record<string, number | string> = { date: point.date };
      merged["cash"] = (point.cash as number) ?? 0;
      for (const name of displayNames) {
        merged[name] = (point[name] as number) ?? 0;
      }
      if (hasOther) {
        let otherSum = 0;
        for (const name of otherNames) {
          otherSum += ((point[name] as number) ?? 0);
        }
        merged["기타"] = otherSum;
      }

      if (mode === "pct") {
        const total = barKeys.reduce((s, k) => s + (Number(merged[k]) || 0), 0);
        if (total === 0) return merged;
        const pctPoint: Record<string, number | string> = { date: point.date };
        for (const k of barKeys) {
          pctPoint[k] = total > 0 ? +((Number(merged[k]) || 0) / total * 100).toFixed(1) : 0;
        }
        // 원본 금액도 보존 (툴팁용)
        for (const k of barKeys) {
          pctPoint[`_raw_${k}`] = merged[k];
        }
        return pctPoint;
      }
      return merged;
    });
  }, [data, displayNames, otherNames, hasOther, barKeys, mode]);

  // 마지막 데이터 기준 비중 계산 (범례용)
  const lastRaw = data[data.length - 1];
  const lastTotal = useMemo(() => {
    if (!lastRaw) return 0;
    let total = (lastRaw.cash as number) ?? 0;
    for (const name of displayNames) total += (Number(lastRaw[name]) || 0);
    if (hasOther) {
      for (const name of otherNames) total += (Number(lastRaw[name]) || 0);
    }
    return total;
  }, [lastRaw, displayNames, otherNames, hasOther]);

  const toggleKey = useCallback((key: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  if (data.length === 0) return null;

  return (
    <div>
      {/* 모드 토글 */}
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => setMode("pct")}
          className={`text-xs px-3 py-1 rounded-md transition-colors ${
            mode === "pct"
              ? "bg-white/10 text-gray-200"
              : "text-gray-500 hover:text-gray-400"
          }`}
        >
          비중
        </button>
        <button
          onClick={() => setMode("amount")}
          className={`text-xs px-3 py-1 rounded-md transition-colors ${
            mode === "amount"
              ? "bg-white/10 text-gray-200"
              : "text-gray-500 hover:text-gray-400"
          }`}
        >
          금액
        </button>
      </div>

      <div className="h-[240px] md:h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              axisLine={{ stroke: "#374151" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) =>
                mode === "pct"
                  ? `${v}%`
                  : v >= 10000
                    ? `${(v / 10000).toFixed(0)}만`
                    : v.toLocaleString()
              }
              domain={mode === "pct" ? [0, 100] : ["auto", "auto"]}
            />
            <Tooltip
              wrapperStyle={{ zIndex: 10 }}
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
              labelFormatter={(label) => `${label}`}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any, props: any) => {
                const label = labelMap[name ?? ""] ?? name ?? "";
                if (mode === "pct") {
                  const raw = props?.payload?.[`_raw_${name}`];
                  return [`${Number(value).toFixed(1)}% (${krw(Number(raw ?? 0))})`, label];
                }
                return [krw(Number(value ?? 0)), label];
              }}
              contentStyle={{
                background: "rgba(15, 23, 42, 0.95)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "10px",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
                fontSize: "12px",
              }}
              itemSorter={(item) => -(item.value as number)}
            />
            {barKeys.map((key) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="1"
                fill={colorMap[key]}
                fillOpacity={hiddenKeys.has(key) ? 0 : 0.8}
                hide={hiddenKeys.has(key)}
                radius={0}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 범례: 클릭으로 토글, 비중 표시 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-2 gap-y-1.5 mt-3 px-1 mb-4">
        {barKeys.map((key) => {
          const label = labelMap[key] ?? key;
          let rawValue = 0;
          if (lastRaw) {
            if (key === "기타") {
              for (const name of otherNames) rawValue += (Number(lastRaw[name]) || 0);
            } else {
              rawValue = Number(lastRaw[key]) || 0;
            }
          }
          const pct = lastTotal > 0 ? ((rawValue / lastTotal) * 100).toFixed(1) : "0.0";
          const isHidden = hiddenKeys.has(key);
          return (
            <button
              key={key}
              onClick={() => toggleKey(key)}
              className={`flex items-center gap-1.5 text-left transition-opacity ${isHidden ? "opacity-30" : "opacity-100"}`}
            >
              <span
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: colorMap[key] }}
              />
              <span className="text-xs text-gray-300 truncate">{label}</span>
              <span className="text-[10px] text-gray-500 tabular-nums shrink-0">{pct}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
