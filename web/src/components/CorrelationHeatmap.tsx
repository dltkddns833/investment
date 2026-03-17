"use client";

import React, { useState } from "react";
import type { CorrelationEntry } from "@/lib/data";

interface Props {
  investorNames: string[];
  correlations: CorrelationEntry[];
}

function getColor(r: number): string {
  if (r > 0.7) return "bg-red-600 text-white";
  if (r > 0.4) return "bg-red-400/60 text-red-100";
  if (r > 0.1) return "bg-red-300/30 text-red-200";
  if (r >= -0.1) return "bg-slate-700 text-gray-300";
  if (r >= -0.4) return "bg-blue-300/30 text-blue-200";
  if (r >= -0.7) return "bg-blue-400/60 text-blue-100";
  return "bg-blue-600 text-white";
}

export default function CorrelationHeatmap({ investorNames, correlations }: Props) {
  const [tooltip, setTooltip] = useState<{
    a: string; b: string; val: number; x: number; y: number;
  } | null>(null);

  const corrMap = new Map<string, number>();
  for (const c of correlations) {
    corrMap.set(`${c.investorA}:${c.investorB}`, c.correlation);
    corrMap.set(`${c.investorB}:${c.investorA}`, c.correlation);
  }

  const getCorr = (a: string, b: string) =>
    a === b ? 1 : (corrMap.get(`${a}:${b}`) ?? 0);

  const n = investorNames.length;

  return (
    <div className="relative">
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `3rem repeat(${n}, minmax(0, 1fr))`,
          gridTemplateRows: `1.5rem repeat(${n}, minmax(0, 1fr))`,
        }}
      >
        {/* Header row */}
        <div />
        {investorNames.map((name) => (
          <div key={name} className="text-[10px] text-gray-400 text-center truncate px-0.5">
            {name.slice(0, 3)}
          </div>
        ))}

        {/* Data rows */}
        {investorNames.map((rowName) => (
          <React.Fragment key={rowName}>
            <div className="text-[10px] text-gray-400 flex items-center justify-end pr-1 truncate">
              {rowName.slice(0, 3)}
            </div>
            {investorNames.map((colName) => {
              const val = getCorr(rowName, colName);
              const isDiag = rowName === colName;
              return (
                <div
                  key={`${rowName}-${colName}`}
                  className={`aspect-square rounded-md flex items-center justify-center text-[9px] md:text-[10px] font-medium cursor-default transition-transform hover:scale-110 ${
                    isDiag ? "bg-slate-600 text-gray-400" : getColor(val)
                  }`}
                  onMouseEnter={(e) => {
                    if (!isDiag) {
                      const cell = e.currentTarget;
                      const container = cell.closest('.relative') as HTMLElement;
                      if (container) {
                        const cellRect = cell.getBoundingClientRect();
                        const containerRect = container.getBoundingClientRect();
                        setTooltip({
                          a: rowName, b: colName, val,
                          x: cellRect.left - containerRect.left + cellRect.width / 2,
                          y: cellRect.top - containerRect.top,
                        });
                      }
                    }
                  }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  {val.toFixed(2)}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-1.5 mt-4 text-xs text-gray-500">
        <span>역상관</span>
        <div className="w-4 h-3 rounded-sm bg-blue-600" />
        <div className="w-4 h-3 rounded-sm bg-blue-400/60" />
        <div className="w-4 h-3 rounded-sm bg-blue-300/30" />
        <div className="w-4 h-3 rounded-sm bg-slate-700 border border-white/10" />
        <div className="w-4 h-3 rounded-sm bg-red-300/30" />
        <div className="w-4 h-3 rounded-sm bg-red-400/60" />
        <div className="w-4 h-3 rounded-sm bg-red-600" />
        <span>양의 상관</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 px-3 py-1.5 bg-gray-800 border border-white/10 rounded-lg text-xs shadow-xl pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y - 8,
            transform: "translate(-50%, -100%)",
          }}
        >
          <span className="text-gray-300">{tooltip.a}</span>
          <span className="text-gray-500"> × </span>
          <span className="text-gray-300">{tooltip.b}</span>
          {" "}
          <span className={tooltip.val > 0 ? "text-red-400" : tooltip.val < 0 ? "text-blue-400" : "text-gray-400"}>
            {tooltip.val.toFixed(3)}
          </span>
        </div>
      )}
    </div>
  );
}
