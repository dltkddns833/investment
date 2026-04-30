"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { krw } from "@/lib/format";

interface Point {
  date: string;
  total_asset: number;
}

export default function AssetCurveChart({ data }: { data: Point[] }) {
  const filtered = data.filter((d) => d.total_asset > 0);
  if (filtered.length === 0) {
    return (
      <div className="text-center text-gray-500 text-sm py-12">
        자산 추이 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={filtered} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
          <defs>
            <linearGradient id="qAsset" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickFormatter={(d: string) => d.slice(5)}
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`}
            domain={["auto", "auto"]}
          />
          <Tooltip
            cursor={{ stroke: "rgba(255, 255, 255, 0.1)" }}
            contentStyle={{
              background: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: 8,
              color: "#e2e8f0",
            }}
            formatter={(v) => krw(Number(v))}
          />
          <Area
            type="monotone"
            dataKey="total_asset"
            stroke="#fbbf24"
            strokeWidth={2}
            fill="url(#qAsset)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
