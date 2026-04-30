"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { krw } from "@/lib/format";
import type { QDailyStats } from "@/lib/q-data";

export default function DailyPnLChart({ data }: { data: QDailyStats[] }) {
  if (data.length === 0) {
    return (
      <div className="text-center text-gray-500 text-sm py-12">
        데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickFormatter={(d: string) => d.slice(5)}
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`}
          />
          <Tooltip
            cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
            contentStyle={{
              background: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: 8,
              color: "#e2e8f0",
            }}
            formatter={(v) => krw(Number(v))}
            labelFormatter={(label) => `${label}`}
          />
          <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.pnl >= 0 ? "#ef4444" : "#3b82f6"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
