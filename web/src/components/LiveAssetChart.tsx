"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import type { RealPortfolioEntry } from "@/lib/data";

interface Props {
  history: RealPortfolioEntry[];
  initialCapital: number;
}

export default function LiveAssetChart({ history, initialCapital }: Props) {
  if (history.length === 0) {
    return (
      <p className="text-center text-gray-500 py-8">데이터 없음</p>
    );
  }

  const hasKospi = history.some((h) => h.kospi_cumulative_pct != null);

  const data = history.map((h) => {
    const kospiAsset =
      h.kospi_cumulative_pct != null
        ? Math.round(initialCapital * (1 + h.kospi_cumulative_pct / 100))
        : null;
    return {
      date: h.date.slice(5), // MM-DD
      fullDate: h.date,
      totalAsset: h.total_asset,
      kospiAsset,
      returnPct: h.cumulative_return_pct,
      kospiPct: h.kospi_cumulative_pct,
      alphaPct: h.alpha_cumulative_pct,
    };
  });

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#64748b", fontSize: 11 }}
            axisLine={{ stroke: "#334155" }}
          />
          <YAxis
            tick={{ fill: "#64748b", fontSize: 11 }}
            axisLine={{ stroke: "#334155" }}
            tickFormatter={(v: number) =>
              `${(v / 10000).toFixed(0)}만`
            }
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            formatter={(value, name) => {
              const v = Number(value);
              if (name === "총자산" || name === "KOSPI")
                return [`${v.toLocaleString("ko-KR")}원`, name];
              return [`${v.toFixed(2)}%`, name];
            }}
            labelFormatter={(_label, payload) => {
              if (payload && payload[0]) {
                return payload[0].payload.fullDate;
              }
              return String(_label);
            }}
          />
          <ReferenceLine
            y={initialCapital}
            stroke="#475569"
            strokeDasharray="4 4"
            label={{
              value: "초기자금",
              fill: "#64748b",
              fontSize: 10,
              position: "right",
            }}
          />
          <Line
            type="monotone"
            dataKey="totalAsset"
            name="총자산"
            stroke="#818cf8"
            strokeWidth={2}
            dot={false}
          />
          {hasKospi && (
            <Line
              type="monotone"
              dataKey="kospiAsset"
              name="KOSPI"
              stroke="#475569"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
