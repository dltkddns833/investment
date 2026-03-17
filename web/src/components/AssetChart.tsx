"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useMemo } from "react";
import { AssetSnapshot } from "@/lib/data";
import { krw } from "@/lib/format";

/** 한국 시간 기준 오늘 날짜(YYYY-MM-DD)와 장마감(15:30) 이후 여부 */
function getKSTInfo() {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const t = now.getHours() * 60 + now.getMinutes();
  return { today: `${yyyy}-${mm}-${dd}`, isAfterClose: t >= 930 };
}

interface Props {
  data: AssetSnapshot[];
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

export default function AssetChart({ data, initialCapital }: Props) {
  // 장마감 전이면 오늘 데이터 제외 (시가 기준이라 부정확)
  const filtered = useMemo(() => {
    const { today, isAfterClose } = getKSTInfo();
    if (isAfterClose) return data;
    return data.filter((d) => d.date !== today);
  }, [data]);

  const lastValue = filtered[filtered.length - 1]?.total_asset ?? initialCapital;
  const isProfit = lastValue >= initialCapital;
  const strokeColor = isProfit ? "#ef4444" : "#3b82f6";
  const fillId = "assetGradient";

  return (
    <div className="h-[200px] md:h-[300px]">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={filtered} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3} />
            <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
          </linearGradient>
        </defs>
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
          formatter={(value) => [krw(Number(value)), "총 자산"]}
          contentStyle={tooltipStyle}
        />
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
        <Area
          type="monotone"
          dataKey="total_asset"
          stroke={strokeColor}
          strokeWidth={2}
          fill={`url(#${fillId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
    </div>
  );
}
