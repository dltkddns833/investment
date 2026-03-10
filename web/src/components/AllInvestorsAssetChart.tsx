"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { AllAssetSnapshot } from "@/lib/data";
import { krw } from "@/lib/format";

interface Props {
  data: AllAssetSnapshot[];
  investorNames: string[];
  initialCapital: number;
}

const COLORS = [
  "#ef4444", // 강돌진 - red
  "#3b82f6", // 김균형 - blue
  "#22c55e", // 이든든 - green
  "#f59e0b", // 장반대 - amber
  "#8b5cf6", // 정기준 - violet
  "#ec4899", // 윤순환 - pink
  "#06b6d4", // 문여론 - cyan
];

const tooltipStyle = {
  background: "rgba(15, 23, 42, 0.9)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "10px",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}`;
}

function formatYAxis(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(0)}만`;
  return value.toLocaleString();
}

export default function AllInvestorsAssetChart({
  data,
  investorNames,
  initialCapital,
}: Props) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
          domain={["auto", "auto"]}
        />
        <Tooltip
          labelFormatter={(label) => `${label}`}
          formatter={(value) => krw(Number(value))}
          contentStyle={tooltipStyle}
        />
        <Legend />
        <ReferenceLine
          y={initialCapital}
          stroke="#6b7280"
          strokeDasharray="4 4"
          label={{
            value: "시드머니",
            position: "left",
            fill: "#6b7280",
            fontSize: 11,
          }}
        />
        {investorNames.map((name, i) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={data.length <= 10}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
