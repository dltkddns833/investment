"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieLabelRenderProps,
} from "recharts";
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

export default function PortfolioChart({ detail }: Props) {
  const data = Object.entries(detail.holdings).map(([, h]) => ({
    name: h.name,
    value: h.value,
  }));

  if (detail.cash > 0) {
    data.push({ name: "현금", value: detail.cash });
  }

  if (data.length === 0) {
    return <div className="text-gray-500 text-center py-8">보유 종목 없음</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={100}
          dataKey="value"
          label={(props: PieLabelRenderProps) =>
            `${props.name ?? ""} ${(((props.percent as number | undefined) ?? 0) * 100).toFixed(1)}%`
          }
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => krw(Number(value))}
          contentStyle={{
            background: "#1f2937",
            border: "1px solid #374151",
            borderRadius: "8px",
          }}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
