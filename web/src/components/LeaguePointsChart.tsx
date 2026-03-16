"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { getInvestorHex } from "@/lib/investor-colors";

interface DailyPoints {
  date: string;
  points: Record<string, number>;
}

interface Props {
  data: DailyPoints[];
  investorNames: string[];
  investorIds: string[];
}

export default function LeaguePointsChart({ data, investorNames, investorIds }: Props) {
  if (data.length === 0) return null;

  const chartData = data.map((d) => {
    const row: Record<string, string | number> = { date: d.date.slice(5) }; // MM-DD
    for (const name of investorNames) {
      row[name] = d.points[name] ?? 0;
    }
    return row;
  });

  return (
    <section className="glass-card p-4 md:p-5 animate-in">
      <h2 className="text-lg font-bold mb-4 section-header">누적 승점 추이</h2>
      <div className="h-72 md:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#374151" }}
            />
            <YAxis
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={35}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelStyle={{ color: "#9ca3af" }}
              formatter={(value) => [`${value}점`]}
            />
            <Legend
              wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
              iconSize={8}
            />
            {investorNames.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={getInvestorHex(investorIds[i])}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
