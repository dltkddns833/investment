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
import type { InvestorScorecard } from "@/lib/scorecard";
import { getInvestorHex } from "@/lib/investor-colors";

interface Props {
  scorecards: InvestorScorecard[];
}

interface ChartEntry {
  investor: string;
  investorId: string;
  live: number;
  backtest: number;
}

export default function BacktestDivergenceChart({ scorecards }: Props) {
  const data: ChartEntry[] = scorecards.map((sc) => ({
    investor: sc.investor,
    investorId: sc.investorId,
    live: Math.round(sc.categories.validation.details.liveReturnPct * 100) / 100,
    backtest:
      Math.round(
        (sc.categories.validation.details.backtestReturnPct ?? 0) * 100
      ) / 100,
  }));

  return (
    <div className="h-64 md:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="investor"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            interval={0}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
            contentStyle={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#e2e8f0",
            }}
            itemStyle={{ color: "#e2e8f0" }}
            formatter={(value, name) => [
              `${Number(value).toFixed(2)}%`,
              name === "live" ? "라이브" : "백테스트",
            ]}
          />
          <Legend
            formatter={(value) =>
              value === "live" ? "라이브 수익률" : "백테스트 수익률"
            }
            wrapperStyle={{ color: "#9ca3af" }}
          />
          <Bar dataKey="live" name="live" barSize={12}>
            {data.map((entry) => (
              <Cell
                key={entry.investorId}
                fill={getInvestorHex(entry.investorId)}
              />
            ))}
          </Bar>
          <Bar
            dataKey="backtest"
            name="backtest"
            barSize={12}
            fillOpacity={0.4}
          >
            {data.map((entry) => (
              <Cell
                key={entry.investorId}
                fill={getInvestorHex(entry.investorId)}
                fillOpacity={0.35}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
