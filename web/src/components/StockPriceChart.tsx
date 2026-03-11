"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { StockPriceSnapshot } from "@/lib/data";
import { krw } from "@/lib/format";

interface Props {
  data: StockPriceSnapshot[];
}

const tooltipStyle = {
  background: "rgba(15, 23, 42, 0.9)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "10px",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
};

export default function StockPriceChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="text-gray-500 text-center py-8 text-sm">
        가격 데이터 없음
      </div>
    );
  }

  const prices = data.map((d) => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const padding = (max - min) * 0.1 || 100;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <XAxis
          dataKey="date"
          tickFormatter={(d) => d.slice(5)}
          tick={{ fill: "#6b7280", fontSize: 11 }}
          axisLine={{ stroke: "rgba(255,255,255,0.05)" }}
          tickLine={false}
        />
        <YAxis
          domain={[min - padding, max + padding]}
          tickFormatter={(v) => v.toLocaleString()}
          tick={{ fill: "#6b7280", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: "#9ca3af", fontSize: 12 }}
          formatter={(value) => [krw(Number(value)), "가격"]}
        />
        <Line
          type="monotone"
          dataKey="price"
          stroke="url(#priceGradient)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#60a5fa" }}
        />
        <defs>
          <linearGradient id="priceGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
      </LineChart>
    </ResponsiveContainer>
  );
}
