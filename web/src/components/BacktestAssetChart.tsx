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
import { useMemo } from "react";
import { BacktestSnapshot } from "@/lib/data";
import { krw } from "@/lib/format";
import { getInvestorHex } from "@/lib/investor-colors";

interface Props {
  snapshots: BacktestSnapshot[];
  investorIds: string[];
  investorNames: Record<string, string>; // id -> name
  initialCapital: number;
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

export default function BacktestAssetChart({
  snapshots,
  investorIds,
  investorNames,
  initialCapital,
}: Props) {
  const chartData = useMemo(() => {
    // date -> { date, [name]: total_asset }
    const byDate: Record<string, Record<string, number | string>> = {};
    for (const s of snapshots) {
      if (!byDate[s.date]) byDate[s.date] = { date: s.date };
      const name = investorNames[s.investor_id] ?? s.investor_id;
      byDate[s.date][name] = s.total_asset;
    }
    return Object.values(byDate).sort(
      (a, b) => (a.date as string).localeCompare(b.date as string)
    );
  }, [snapshots, investorNames]);

  const names = investorIds.map((id) => investorNames[id] ?? id);

  return (
    <div className="h-[250px] md:h-[350px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
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
            wrapperStyle={{ zIndex: 10 }}
            labelFormatter={(label) => `${label}`}
            formatter={(value) => krw(Number(value))}
            contentStyle={tooltipStyle}
            itemSorter={(item) => -(Number(item.value) || 0)}
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
          {names.map((name, i) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={getInvestorHex(investorIds[i])}
              strokeWidth={2}
              dot={chartData.length <= 15}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
