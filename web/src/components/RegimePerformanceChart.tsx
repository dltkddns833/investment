"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { RegimePerformance } from "@/lib/regime-analysis";
import { getInvestorHex } from "@/lib/investor-colors";

interface Props {
  performances: RegimePerformance[];
}

const REGIME_COLORS: Record<string, string> = {
  bull: "#22c55e",
  neutral: "#6b7280",
  bear: "#ef4444",
};

const REGIME_LABELS: Record<string, string> = {
  bull: "강세장",
  neutral: "중립장",
  bear: "약세장",
};

export default function RegimePerformanceChart({ performances }: Props) {
  if (performances.length === 0) {
    return <p className="text-gray-500 text-sm">데이터가 부족합니다.</p>;
  }

  const data = performances.map((p) => ({
    name: p.investor,
    investorId: p.investorId,
    bull: p.bull?.returnPct ?? 0,
    neutral: p.neutral?.returnPct ?? 0,
    bear: p.bear?.returnPct ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={360}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="name"
          tick={{ fill: "#9ca3af", fontSize: 11 }}
          interval={0}
          angle={-30}
          textAnchor="end"
          height={60}
        />
        <YAxis
          tick={{ fill: "#9ca3af", fontSize: 11 }}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.05)" }}
          contentStyle={{
            background: "rgba(15, 23, 42, 0.9)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          formatter={(value, name) => [
            `${Number(value).toFixed(2)}%`,
            REGIME_LABELS[String(name)] ?? name,
          ]}
        />
        <Legend
          formatter={(value) => REGIME_LABELS[value] ?? value}
          wrapperStyle={{ fontSize: "12px" }}
        />
        <Bar dataKey="bull" fill={REGIME_COLORS.bull} radius={[2, 2, 0, 0]} />
        <Bar dataKey="neutral" fill={REGIME_COLORS.neutral} radius={[2, 2, 0, 0]} />
        <Bar dataKey="bear" fill={REGIME_COLORS.bear} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
