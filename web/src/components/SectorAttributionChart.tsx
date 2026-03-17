"use client";

import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import type { SectorAttribution } from "@/lib/data";
import { krw } from "@/lib/format";

interface Props {
  sectorAttributions: SectorAttribution[];
}

interface TreemapItem {
  [key: string]: string | number;
  name: string;
  size: number;
  profit: number;
  contributionPct: number;
  weight: number;
  stockCount: number;
  fill: string;
}

function CustomContent(props: Record<string, unknown>) {
  const { x, y, width, height, name, contributionPct } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    name: string;
    contributionPct: number;
    fill: string;
  };

  if (width < 40 || height < 30) return null;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={4}
        fill={(props as { fill: string }).fill}
        stroke="rgba(15, 23, 42, 0.8)"
        strokeWidth={2}
      />
      {width > 50 && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - 6}
            textAnchor="middle"
            fill="#f3f4f6"
            fontSize={width > 80 ? 12 : 10}
            fontWeight="bold"
          >
            {name}
          </text>
          <text
            x={x + width / 2}
            y={y + height / 2 + 10}
            textAnchor="middle"
            fill={contributionPct >= 0 ? "#fca5a5" : "#93c5fd"}
            fontSize={10}
          >
            {contributionPct > 0 ? "+" : ""}{contributionPct}%
          </text>
        </>
      )}
    </g>
  );
}

export default function SectorAttributionChart({ sectorAttributions }: Props) {
  if (sectorAttributions.length === 0) {
    return <p className="text-sm text-gray-500">보유 종목이 없습니다.</p>;
  }

  const data: TreemapItem[] = sectorAttributions.map((s) => ({
    name: s.sector,
    size: Math.max(Math.abs(s.contributionPct), 0.5),
    profit: s.profit,
    contributionPct: s.contributionPct,
    weight: s.weight,
    stockCount: s.stockCount,
    fill: s.profit >= 0
      ? `rgba(239, 68, 68, ${Math.min(0.3 + Math.abs(s.contributionPct) / 100, 0.8)})`
      : `rgba(59, 130, 246, ${Math.min(0.3 + Math.abs(s.contributionPct) / 100, 0.8)})`,
  }));

  return (
    <div>
      <div className="h-[200px] md:h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="size"
            stroke="none"
            content={<CustomContent />}
          >
            <Tooltip
              wrapperStyle={{ zIndex: 10 }}
              cursor={{ fill: "transparent" }}
              contentStyle={{
                backgroundColor: "rgba(15, 23, 42, 0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                fontSize: "12px",
                color: "#e5e7eb",
              }}
              labelStyle={{ color: "#9ca3af" }}
              itemStyle={{ color: "#e5e7eb" }}
              formatter={(_: unknown, __: unknown, item: { payload?: TreemapItem }) => {
                const d = item?.payload;
                if (!d) return [];
                return [`손익: ${krw(d.profit)} | 기여도: ${d.contributionPct}% | 비중: ${d.weight}% | ${d.stockCount}종목`, d.name];
              }}
            />
          </Treemap>
        </ResponsiveContainer>
      </div>

      {/* 섹터 범례 */}
      <div className="flex flex-wrap gap-2 mt-3">
        {sectorAttributions.map((s) => (
          <div
            key={s.sector}
            className="text-xs px-2 py-1 rounded-md border border-white/5 bg-white/[0.02]"
          >
            <span className="text-gray-300">{s.sector}</span>
            <span className={`ml-1 font-medium ${s.profit >= 0 ? "text-red-400" : "text-blue-400"}`}>
              {s.contributionPct > 0 ? "+" : ""}{s.contributionPct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
