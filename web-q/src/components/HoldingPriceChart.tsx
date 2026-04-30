"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Bar {
  time: string;
  price: number;
}

interface Props {
  ticker: string;
  buyAtKst: string;
  buyPrice: number;
}

export default function HoldingPriceChart({
  ticker,
  buyAtKst,
  buyPrice,
}: Props) {
  const [bars, setBars] = useState<Bar[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;

    async function load() {
      try {
        const resp = await fetch(
          `/api/kis-minute?ticker=${encodeURIComponent(ticker)}&from=${encodeURIComponent(buyAtKst)}`,
          { cache: "no-store" }
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (!stopped) {
          setBars((data.bars ?? []) as Bar[]);
          setError(null);
        }
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : String(e));
      }
    }

    load();
    const id = setInterval(load, 60_000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [ticker, buyAtKst]);

  if (error) {
    return (
      <div className="text-xs text-gray-500 py-4 text-center">
        분봉 차트 로드 실패
      </div>
    );
  }

  if (bars.length === 0) {
    return (
      <div className="text-xs text-gray-500 py-4 text-center">
        분봉 데이터 수집 중…
      </div>
    );
  }

  const lossLine = buyPrice * 0.97;
  const winLine = buyPrice * 1.04;
  const prices = bars.map((b) => b.price);
  const minP = Math.min(...prices, lossLine);
  const maxP = Math.max(...prices, winLine);
  const padding = Math.max(1, Math.round((maxP - minP) * 0.08) || 1);

  return (
    <div className="h-32 sm:h-40">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={bars}
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            tickFormatter={(t: string) => `${t.slice(0, 2)}:${t.slice(2, 4)}`}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[minP - padding, maxP + padding]}
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            tickFormatter={(v: number) => v.toLocaleString()}
            width={56}
          />
          <Tooltip
            cursor={{ stroke: "rgba(255, 255, 255, 0.15)" }}
            contentStyle={{
              background: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: 8,
              color: "#e2e8f0",
              fontSize: 12,
            }}
            labelFormatter={(t) =>
              `${String(t).slice(0, 2)}:${String(t).slice(2, 4)}`
            }
            formatter={(v) => `${Number(v).toLocaleString()}원`}
          />
          <ReferenceLine
            y={winLine}
            stroke="#f87171"
            strokeDasharray="2 4"
            strokeWidth={1}
            label={{
              value: "익절 +4%",
              fill: "#f87171",
              fontSize: 10,
              position: "insideTopRight",
            }}
          />
          <ReferenceLine
            y={buyPrice}
            stroke="#fbbf24"
            strokeDasharray="3 3"
            strokeWidth={1}
          />
          <ReferenceLine
            y={lossLine}
            stroke="#60a5fa"
            strokeDasharray="2 4"
            strokeWidth={1}
            label={{
              value: "손절 -3%",
              fill: "#60a5fa",
              fontSize: 10,
              position: "insideBottomRight",
            }}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#e2e8f0"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
