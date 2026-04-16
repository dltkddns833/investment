"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import type { CashflowSnapshot } from "@/lib/data";
import { krw } from "@/lib/format";

interface Props {
  data: CashflowSnapshot[];
}

export default function CashflowChart({ data }: Props) {
  if (data.length === 0) return null;

  return (
    <div className="h-[300px] md:h-[350px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickFormatter={(v) => v.slice(5)}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            formatter={(value, name) => [
              krw(Number(value)),
              name === "cashflow_account" ? "누적 현금흐름" : "일일 손익",
            ]}
            labelFormatter={(label) => `${label}`}
          />
          <Legend
            formatter={(value) =>
              value === "cashflow_account" ? "누적 현금흐름" : "일일 손익"
            }
          />
          <ReferenceLine yAxisId="left" y={0} stroke="#475569" strokeDasharray="3 3" />
          <Bar
            yAxisId="right"
            dataKey="daily_pnl"
            fill="#0ea5e9"
            opacity={0.4}
            radius={[2, 2, 0, 0]}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="cashflow_account"
            stroke="#0ea5e9"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
