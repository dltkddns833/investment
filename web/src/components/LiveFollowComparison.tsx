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
  Legend,
} from "recharts";
import type { RealPortfolioEntry, InvestorSnapshot } from "@/lib/data";
import { getInvestorHex } from "@/lib/investor-colors";

interface Props {
  history: RealPortfolioEntry[];
  investorSnapshots: InvestorSnapshot[];
  investorId: string;
  investorName: string;
  followStartDate: string;
}

export default function LiveFollowComparison({
  history,
  investorSnapshots,
  investorId,
  investorName,
  followStartDate,
}: Props) {
  const hex = getInvestorHex(investorId);

  const liveSeries = history.filter((h) => h.date >= followStartDate);
  const simSeries = investorSnapshots.filter((s) => s.date >= followStartDate);

  if (liveSeries.length === 0 || simSeries.length === 0) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-gray-400 mb-2">
          {investorName} 시뮬 vs 실전 (추종 이후)
        </h2>
        <p className="text-center text-xs text-gray-500 py-6">
          {followStartDate} 이후 비교 데이터가 축적되면 표시됩니다.
        </p>
      </div>
    );
  }

  const liveBase = liveSeries[0].total_asset;
  const simBase = simSeries[0].total_asset;

  const liveKospiBasePct = liveSeries[0].kospi_cumulative_pct ?? null;
  const baseKospiMultiplier =
    liveKospiBasePct != null ? 1 + liveKospiBasePct / 100 : null;

  const simMap = new Map(simSeries.map((s) => [s.date, s.total_asset]));
  const dates = Array.from(
    new Set([...liveSeries.map((h) => h.date), ...simSeries.map((s) => s.date)])
  ).sort();

  const data = dates.map((d) => {
    const liveRow = liveSeries.find((h) => h.date === d);
    const simAsset = simMap.get(d);
    const livePct =
      liveRow && liveBase > 0
        ? (liveRow.total_asset / liveBase - 1) * 100
        : null;
    const simPct =
      simAsset && simBase > 0 ? (simAsset / simBase - 1) * 100 : null;
    let kospiPct: number | null = null;
    if (
      liveRow &&
      liveRow.kospi_cumulative_pct != null &&
      baseKospiMultiplier != null &&
      baseKospiMultiplier > 0
    ) {
      const currentMultiplier = 1 + liveRow.kospi_cumulative_pct / 100;
      kospiPct = (currentMultiplier / baseKospiMultiplier - 1) * 100;
    }
    return {
      date: d.slice(5),
      fullDate: d,
      실전: livePct,
      [`${investorName}(시뮬)`]: simPct,
      KOSPI: kospiPct,
    };
  });

  const lastRow = data[data.length - 1];
  const liveLast = (lastRow["실전"] as number | null) ?? 0;
  const simLast = (lastRow[`${investorName}(시뮬)`] as number | null) ?? 0;
  const kospiLast = (lastRow["KOSPI"] as number | null) ?? null;
  const diff = liveLast - simLast;

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 sm:p-5">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-gray-400">
          {investorName} 시뮬 vs 실전 (추종 이후)
        </h2>
        <span className="text-[11px] text-gray-500">
          {followStartDate}부터 재계산
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4 text-center text-xs">
        <div className="rounded-lg bg-white/5 p-2">
          <p className="text-gray-500 mb-0.5">실전</p>
          <p
            className={`font-semibold ${
              liveLast >= 0 ? "text-red-400" : "text-blue-400"
            }`}
          >
            {liveLast >= 0 ? "+" : ""}
            {liveLast.toFixed(2)}%
          </p>
        </div>
        <div
          className="rounded-lg p-2"
          style={{ backgroundColor: `${hex}1a` }}
        >
          <p className="text-gray-500 mb-0.5">{investorName}(시뮬)</p>
          <p className="font-semibold" style={{ color: hex }}>
            {simLast >= 0 ? "+" : ""}
            {simLast.toFixed(2)}%
          </p>
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <p className="text-gray-500 mb-0.5">괴리</p>
          <p
            className={`font-semibold ${
              diff >= 0 ? "text-red-400" : "text-blue-400"
            }`}
          >
            {diff >= 0 ? "+" : ""}
            {diff.toFixed(2)}%p
          </p>
        </div>
      </div>

      <div className="h-56">
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
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value) => {
                if (value == null) return ["-", ""];
                const v = Number(value);
                return [`${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, ""];
              }}
              labelFormatter={(_label, payload) => {
                if (payload && payload[0]) {
                  return payload[0].payload.fullDate;
                }
                return String(_label);
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
            <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />
            <Line
              type="monotone"
              dataKey="실전"
              stroke="#818cf8"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey={`${investorName}(시뮬)`}
              stroke={hex}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="KOSPI"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {kospiLast != null && (
        <p className="text-[11px] text-gray-500 mt-2">
          KOSPI(추종 이후): {kospiLast >= 0 ? "+" : ""}
          {kospiLast.toFixed(2)}% — 벤치마크는 동일 시점부터 재계산됩니다.
        </p>
      )}
    </div>
  );
}
