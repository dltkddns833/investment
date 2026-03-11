"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { InvestorDetail } from "@/lib/data";
import { krw } from "@/lib/format";

interface Props {
  detail: InvestorDetail;
}

const COLORS = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#14b8a6",
  "#6366f1",
  "#84cc16",
  "#e11d48",
  "#0ea5e9",
  "#d946ef",
  "#78716c",
];

const tooltipStyle = {
  background: "rgba(15, 23, 42, 0.9)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "10px",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
};

export default function PortfolioChart({ detail }: Props) {
  const data = Object.entries(detail.holdings)
    .map(([, h]) => ({ name: h.name, value: h.value }))
    .sort((a, b) => b.value - a.value);

  if (detail.cash > 0) {
    data.push({ name: "현금", value: detail.cash });
  }

  if (data.length === 0) {
    return (
      <div className="text-gray-500 text-center py-8">보유 종목 없음</div>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={1}
            dataKey="value"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => krw(Number(value))}
            contentStyle={tooltipStyle}
          />
        </PieChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 px-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span className="text-xs md:text-sm text-gray-300 truncate">{d.name}</span>
            <span className="text-xs text-gray-500 tabular-nums ml-auto shrink-0">
              {((d.value / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
