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
import { krw } from "@/lib/format";

interface Props {
  data: { date: string; [key: string]: number | string }[];
  investorA: string;
  investorB: string;
  initialCapital: number;
  colorA: string;
  colorB: string;
}

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

export default function VersusChart({
  data, investorA, investorB, initialCapital, colorA, colorB,
}: Props) {
  return (
    <div className="h-[250px] md:h-[350px]">
      <ResponsiveContainer width="100%" height="100%">
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
          <Legend wrapperStyle={{ fontSize: "12px" }} />
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
          <Line type="monotone" dataKey={investorA} stroke={colorA} strokeWidth={2.5} dot={data.length <= 10} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey={investorB} stroke={colorB} strokeWidth={2.5} dot={data.length <= 10} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
