"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { QDailyStats } from "@/lib/data";

interface Props {
  data: QDailyStats[];
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + p.value, 0);
  return (
    <div className="bg-gray-900 border border-white/10 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-gray-400 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono text-gray-200">{p.value}회</span>
        </div>
      ))}
      <div className="border-t border-white/10 mt-1 pt-1 flex justify-between">
        <span className="text-gray-400">합계</span>
        <span className="font-mono text-gray-200">{total}회</span>
      </div>
    </div>
  );
};

export default function QDailyBar({ data }: Props) {
  if (data.length === 0) {
    return <p className="text-gray-500 text-sm">데이터 없음</p>;
  }

  const chartData = data
    .filter((d) => d.trade_count > 0)
    .map((d) => ({
      date: d.date.slice(5),
      익절: d.win_count,
      손절: d.loss_count,
      강제청산: d.forced_count,
    }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fill: "#6b7280", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fill: "#6b7280", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "#9ca3af" }}
          iconSize={8}
        />
        <ReferenceLine y={0} stroke="#374151" />
        <Bar dataKey="익절" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
        <Bar dataKey="손절" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
        <Bar dataKey="강제청산" stackId="a" fill="#6b7280" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
