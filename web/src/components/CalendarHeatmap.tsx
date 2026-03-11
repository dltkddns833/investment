"use client";

import { useState } from "react";
import type { DailyReturn } from "@/lib/data";

interface Props {
  data: DailyReturn[];
  year: number;
  month: number;
}

function getColor(pct: number): string {
  if (pct > 2) return "bg-red-700 text-white";
  if (pct > 1) return "bg-red-500 text-white";
  if (pct > 0.3) return "bg-red-400/50 text-red-200";
  if (pct >= -0.3) return "bg-slate-800 text-gray-400";
  if (pct >= -1) return "bg-blue-400/50 text-blue-200";
  if (pct >= -2) return "bg-blue-500 text-white";
  return "bg-blue-700 text-white";
}

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export default function CalendarHeatmap({ data, year, month }: Props) {
  const [tooltip, setTooltip] = useState<{
    date: string;
    pct: number;
    x: number;
    y: number;
  } | null>(null);

  const returnMap = new Map(data.map((d) => [d.date, d.return_pct]));

  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDow = (firstDay.getDay() + 6) % 7; // Monday=0

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="relative">
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="text-center text-xs text-gray-500 py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={i} className="aspect-square" />;
          }

          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dow = (startDow + day - 1) % 7;
          const isWeekend = dow >= 5;
          const pct = returnMap.get(dateStr);
          const hasData = pct !== undefined;

          return (
            <div
              key={i}
              className={`aspect-square rounded-md flex items-center justify-center text-xs font-medium cursor-default transition-transform hover:scale-110 ${
                hasData
                  ? getColor(pct)
                  : isWeekend
                    ? "bg-transparent border border-white/5 text-gray-600"
                    : "bg-white/[0.02] border border-white/5 text-gray-500"
              }`}
              onMouseEnter={(e) => {
                if (hasData) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTooltip({
                    date: dateStr,
                    pct,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                  });
                }
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              {day}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-1.5 mt-4 text-xs text-gray-500">
        <span>손실</span>
        <div className="w-4 h-3 rounded-sm bg-blue-700" />
        <div className="w-4 h-3 rounded-sm bg-blue-500" />
        <div className="w-4 h-3 rounded-sm bg-blue-400/50" />
        <div className="w-4 h-3 rounded-sm bg-slate-800 border border-white/10" />
        <div className="w-4 h-3 rounded-sm bg-red-400/50" />
        <div className="w-4 h-3 rounded-sm bg-red-500" />
        <div className="w-4 h-3 rounded-sm bg-red-700" />
        <span>수익</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 px-3 py-1.5 bg-gray-800 border border-white/10 rounded-lg text-xs shadow-xl pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y - 8,
            transform: "translate(-50%, -100%)",
          }}
        >
          <span className="text-gray-400">{tooltip.date}</span>{" "}
          <span
            className={
              tooltip.pct > 0
                ? "text-red-400"
                : tooltip.pct < 0
                  ? "text-blue-400"
                  : "text-gray-400"
            }
          >
            {tooltip.pct > 0 ? "+" : ""}
            {tooltip.pct.toFixed(2)}%
          </span>
        </div>
      )}
    </div>
  );
}
