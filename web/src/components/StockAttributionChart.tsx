"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import type { StockAttribution } from "@/lib/data";
import { krw } from "@/lib/format";

interface Props {
  attributions: StockAttribution[];
  totalReturn: number;
}

export default function StockAttributionChart({ attributions, totalReturn }: Props) {
  if (attributions.length === 0) {
    return <p className="text-sm text-gray-500">보유 종목이 없습니다.</p>;
  }

  const data = attributions.slice(0, 15).map((a) => ({
    name: a.name,
    contributionPct: a.contributionPct,
    profit: a.profit,
    weight: a.weight,
    profitPct: a.profitPct,
  }));

  const chartHeight = Math.max(200, data.length * 32 + 40);

  return (
    <div style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <XAxis
            type="number"
            tick={{ fill: "#6b7280", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#374151" }}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: "#d1d5db", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={80}
          />
          <Tooltip
            wrapperStyle={{ zIndex: 10 }}
            cursor={{ fill: "rgba(255,255,255,0.05)" }}
            contentStyle={{
              backgroundColor: "rgba(15, 23, 42, 0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#e5e7eb",
            }}
            labelStyle={{ color: "#9ca3af" }}
            itemStyle={{ color: "#e5e7eb" }}
            formatter={(value) => [`${value}%`, "기여도"]}
            labelFormatter={(label) => {
              const item = data.find((d) => d.name === label);
              if (!item) return label;
              return `${label} | 손익: ${krw(item.profit)} | 비중: ${item.weight}%`;
            }}
          />
          <ReferenceLine x={0} stroke="#374151" />
          <Bar dataKey="contributionPct" radius={[0, 4, 4, 0]} maxBarSize={20}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={d.contributionPct >= 0 ? "rgba(239, 68, 68, 0.7)" : "rgba(59, 130, 246, 0.7)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
