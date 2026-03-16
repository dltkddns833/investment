"use client";

import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import type { SentimentHistoryEntry } from "@/lib/data";

interface Props {
  data: SentimentHistoryEntry[];
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}`;
}

export default function SentimentTrendChart({ data }: Props) {
  if (data.length === 0) return null;

  // 날짜별 평균 감성 점수
  const chartData = data.map((entry) => {
    const scores = Object.values(entry.scores).map((s) => s.score);
    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    return {
      date: entry.date,
      avg: Math.round(avg * 100) / 100,
      count: scores.length,
    };
  });

  return (
    <div className="h-[200px] md:h-[250px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            axisLine={{ stroke: "#374151" }}
            tickLine={false}
          />
          <YAxis
            domain={[-1, 1]}
            ticks={[-1, -0.5, 0, 0.5, 1]}
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            labelFormatter={(label) => `${label}`}
            formatter={(value: number) => [value.toFixed(2), "평균 감성 점수"]}
            contentStyle={{
              background: "rgba(15, 23, 42, 0.9)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "10px",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
            }}
          />
          <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="4 4" />
          <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.avg >= 0 ? "rgba(239, 68, 68, 0.7)" : "rgba(59, 130, 246, 0.7)"}
              />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
