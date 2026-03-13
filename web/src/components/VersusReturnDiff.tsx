"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";

interface Props {
  data: { date: string; diff: number }[];
  investorA: string;
  investorB: string;
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

export default function VersusReturnDiff({ data, investorA, investorB }: Props) {
  return (
    <div>
      <div className="flex items-center justify-center gap-4 mb-2 text-xs text-gray-400">
        <span className="text-red-400">{investorA} 우위 (+)</span>
        <span className="text-blue-400">{investorB} 우위 (−)</span>
      </div>
      <div className="h-[200px] md:h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
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
              tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value) => {
                const v = Number(value);
                return [`${v > 0 ? "+" : ""}${v.toFixed(3)}%p`, "수익률 차이"];
              }}
              labelFormatter={(label) => `${label}`}
            />
            <ReferenceLine y={0} stroke="#4b5563" />
            <Bar dataKey="diff" radius={[2, 2, 0, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.diff >= 0 ? "#ef4444" : "#3b82f6"}
                  fillOpacity={0.7}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
