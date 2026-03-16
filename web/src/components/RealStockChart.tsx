"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { krw } from "@/lib/format";

interface ChartData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Props {
  ticker: string;
}

const RANGES = [
  { key: "1mo", label: "1M" },
  { key: "3mo", label: "3M" },
  { key: "6mo", label: "6M" },
  { key: "1y", label: "1Y" },
] as const;

const tooltipStyle = {
  background: "rgba(15, 23, 42, 0.95)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "10px",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
  padding: "10px 14px",
};

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

export default function RealStockChart({ ticker }: Props) {
  const [range, setRange] = useState<string>("3mo");
  const [data, setData] = useState<ChartData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchChart = useCallback(async (r: string) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/stock-chart?ticker=${encodeURIComponent(ticker)}&range=${r}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    fetchChart(range);
  }, [range, fetchChart]);

  const handleRange = (r: string) => {
    setRange(r);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[240px] sm:h-[340px] text-gray-500 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
          차트 로딩 중...
        </div>
      </div>
    );
  }

  if (error || !data || data.length === 0) {
    return (
      <div className="text-gray-500 text-center py-8 text-sm">
        차트 데이터를 불러올 수 없습니다
      </div>
    );
  }

  const prices = data.map((d) => d.close);
  const minPrice = Math.min(...data.map((d) => d.low));
  const maxPrice = Math.max(...data.map((d) => d.high));
  const padding = (maxPrice - minPrice) * 0.08 || 100;
  const maxVolume = Math.max(...data.map((d) => d.volume));

  const color = "#60a5fa"; // brand blue

  // Normalize volume to ~25% of price chart height
  const volumeData = data.map((d) => ({
    ...d,
    volNorm: maxVolume > 0 ? (d.volume / maxVolume) * (maxPrice - minPrice) * 0.25 + minPrice - padding : 0,
  }));

  return (
    <div>
      {/* Range selector */}
      <div className="flex items-center gap-1 mb-4">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => handleRange(r.key)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              range === r.key
                ? "bg-white/10 text-white"
                : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="h-[240px] sm:h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={volumeData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`areaFill-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id={`lineStroke-${ticker}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#a78bfa" />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="date"
              tickFormatter={(d) => {
                const [, m, day] = d.split("-");
                return `${parseInt(m)}/${parseInt(day)}`;
              }}
              tick={{ fill: "#6b7280", fontSize: 10 }}
              axisLine={{ stroke: "rgba(255,255,255,0.05)" }}
              tickLine={false}
              minTickGap={30}
            />
            <YAxis
              yAxisId="price"
              domain={[minPrice - padding, maxPrice + padding]}
              tickFormatter={(v) =>
                v >= 10000 ? `${(v / 10000).toFixed(0)}만` : v.toLocaleString()
              }
              tick={{ fill: "#6b7280", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={45}
            />
            <YAxis yAxisId="volume" hide domain={[0, maxVolume * 4]} />

            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={{ color: "#9ca3af", fontSize: 12, marginBottom: 4 }}
              formatter={(value, name) => {
                const v = Number(value);
                if (name === "volume") return [formatVolume(v), "거래량"];
                const labels: Record<string, string> = {
                  close: "종가",
                  open: "시가",
                  high: "고가",
                  low: "저가",
                };
                return [krw(v), labels[String(name)] ?? String(name)];
              }}
              itemSorter={() => 0}
            />

            <ReferenceLine
              yAxisId="price"
              y={prices[0]}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="3 3"
            />

            {/* Volume bars */}
            <Bar
              yAxisId="volume"
              dataKey="volume"
              fill="#60a5fa"
              opacity={0.12}
              barSize={data.length > 120 ? 1 : data.length > 60 ? 2 : 3}
            />

            {/* Price area */}
            <Area
              yAxisId="price"
              type="monotone"
              dataKey="close"
              stroke={`url(#lineStroke-${ticker})`}
              strokeWidth={1.5}
              fill={`url(#areaFill-${ticker})`}
              dot={false}
              activeDot={{ r: 3, fill: "#60a5fa", stroke: "#60a5fa", strokeWidth: 1 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:flex sm:items-center gap-x-4 gap-y-1 mt-3 text-xs text-gray-500">
        <span>시가 {krw(data[data.length - 1].open)}</span>
        <span>고가 <span className="text-red-400">{krw(data[data.length - 1].high)}</span></span>
        <span>저가 <span className="text-blue-400">{krw(data[data.length - 1].low)}</span></span>
        <span>거래량 {formatVolume(data[data.length - 1].volume)}</span>
      </div>
    </div>
  );
}
