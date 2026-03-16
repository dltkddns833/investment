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
import { AllAssetSnapshot } from "@/lib/data";
import { krw } from "@/lib/format";
import { INVESTOR_COLOR_ARRAY } from "@/lib/investor-colors";

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
  data: AllAssetSnapshot[];
  investorNames: string[];
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

export default function AllInvestorsAssetChart({
  data,
  investorNames,
  initialCapital,
}: Props) {
  // 장마감 전이면 오늘 데이터 제외 (시가 기준이라 부정확)
  const filtered = useMemo(() => {
    const { today, isAfterClose } = getKSTInfo();
    if (isAfterClose) return data;
    return data.filter((d) => d.date !== today);
  }, [data]);

  return (
    <div className="h-[250px] md:h-[350px]">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={filtered} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
          labelFormatter={(label) => `${label}`}
          formatter={(value) => krw(Number(value))}
          contentStyle={tooltipStyle}
          itemSorter={(item) => -(Number(item.value) || 0)}
        />
        <Legend wrapperStyle={{ fontSize: '12px' }} />
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
        {investorNames.map((name, i) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={INVESTOR_COLOR_ARRAY[i % INVESTOR_COLOR_ARRAY.length]}
            strokeWidth={2}
            dot={data.length <= 10}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
    </div>
  );
}
