"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { InvestorAttribution } from "@/lib/data";
import { getInvestorHex } from "@/lib/investor-colors";
import InvestorAvatar from "./InvestorAvatar";

interface Props {
  attributions: InvestorAttribution[];
}

export default function AttributionComparisonChart({ attributions }: Props) {
  const defaultVisible = new Set(
    attributions
      .sort((a, b) => Math.abs(b.totalReturnPct) - Math.abs(a.totalReturnPct))
      .slice(0, 5)
      .map((a) => a.investor)
  );
  const [visible, setVisible] = useState<Set<string>>(defaultVisible);

  const toggle = (name: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  // 모든 섹터 수집
  const allSectors = new Set<string>();
  for (const a of attributions) {
    for (const s of a.sectorAttributions) allSectors.add(s.sector);
  }

  // 차트 데이터: 행=섹터, 컬럼=투자자별 기여도
  const visibleAttrs = attributions.filter((a) => visible.has(a.investor));
  const chartData = [...allSectors].map((sector) => {
    const row: Record<string, string | number> = { sector };
    for (const a of visibleAttrs) {
      const sa = a.sectorAttributions.find((s) => s.sector === sector);
      row[a.investor] = sa ? sa.contributionPct : 0;
    }
    return row;
  }).filter((row) => {
    // 모든 투자자가 0인 섹터는 제외
    return visibleAttrs.some((a) => Math.abs((row[a.investor] as number) ?? 0) > 0.1);
  }).sort((a, b) => {
    const sumA = visibleAttrs.reduce((acc, inv) => acc + Math.abs((a[inv.investor] as number) ?? 0), 0);
    const sumB = visibleAttrs.reduce((acc, inv) => acc + Math.abs((b[inv.investor] as number) ?? 0), 0);
    return sumB - sumA;
  });

  const chartHeight = Math.max(250, chartData.length * 40 + 60);

  return (
    <div>
      {/* 투자자 토글 */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {attributions.map((a) => (
          <button
            key={a.investorId}
            onClick={() => toggle(a.investor)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs border border-white/10 transition-opacity"
            style={{ opacity: visible.has(a.investor) ? 1 : 0.3 }}
          >
            <InvestorAvatar investorId={a.investorId} size="sm" />
            <span className="text-gray-300">{a.investor}</span>
          </button>
        ))}
      </div>

      {chartData.length === 0 ? (
        <p className="text-sm text-gray-500">표시할 데이터가 없습니다.</p>
      ) : (
        <div style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <XAxis
                type="number"
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#374151" }}
                tickFormatter={(v) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey="sector"
                tick={{ fill: "#d1d5db", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={80}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                contentStyle={{
                  backgroundColor: "rgba(15, 23, 42, 0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#e5e7eb",
                }}
                labelStyle={{ color: "#9ca3af" }}
                itemStyle={{ color: "#e5e7eb" }}
                formatter={(value) => [`${value}%`]}
              />
              <Legend
                wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                iconSize={8}
              />
              {visibleAttrs.map((a) => (
                <Bar
                  key={a.investorId}
                  dataKey={a.investor}
                  fill={getInvestorHex(a.investorId)}
                  radius={[0, 4, 4, 0]}
                  maxBarSize={16}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
