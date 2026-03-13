"use client";

import React, { useState } from "react";
import type { PositionOverlap } from "@/lib/data";

interface Props {
  investorNames: string[];
  overlaps: PositionOverlap[];
  stockNames?: Record<string, string>;
}

function getColor(pct: number): string {
  if (pct >= 0.6) return "bg-emerald-500/70 text-white";
  if (pct >= 0.4) return "bg-emerald-400/40 text-emerald-100";
  if (pct >= 0.2) return "bg-emerald-300/20 text-emerald-200";
  if (pct > 0) return "bg-slate-700/80 text-gray-300";
  return "bg-slate-800 text-gray-500";
}

export default function OverlapMatrix({ investorNames, overlaps, stockNames = {} }: Props) {
  const name = (ticker: string) => stockNames[ticker] ?? ticker;
  const [selected, setSelected] = useState<PositionOverlap | null>(null);

  const overlapMap = new Map<string, PositionOverlap>();
  for (const o of overlaps) {
    overlapMap.set(`${o.investorA}:${o.investorB}`, o);
    overlapMap.set(`${o.investorB}:${o.investorA}`, {
      ...o,
      investorA: o.investorB,
      investorB: o.investorA,
      onlyA: o.onlyB,
      onlyB: o.onlyA,
    });
  }

  const n = investorNames.length;

  return (
    <div>
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `3rem repeat(${n}, minmax(0, 1fr))`,
          gridTemplateRows: `1.5rem repeat(${n}, minmax(0, 1fr))`,
        }}
      >
        <div />
        {investorNames.map((name) => (
          <div key={name} className="text-[10px] text-gray-400 text-center truncate px-0.5">
            {name.slice(0, 3)}
          </div>
        ))}

        {investorNames.map((rowName) => (
          <React.Fragment key={rowName}>
            <div className="text-[10px] text-gray-400 flex items-center justify-end pr-1 truncate">
              {rowName.slice(0, 3)}
            </div>
            {investorNames.map((colName) => {
              const isDiag = rowName === colName;
              const o = overlapMap.get(`${rowName}:${colName}`);
              const val = isDiag ? 1 : (o?.overlap ?? 0);
              return (
                <div
                  key={`${rowName}-${colName}`}
                  className={`aspect-square rounded-md flex items-center justify-center text-[9px] md:text-[10px] font-medium transition-transform hover:scale-110 ${
                    isDiag ? "bg-slate-600 text-gray-400 cursor-default" : `${getColor(val)} cursor-pointer`
                  } ${selected && selected.investorA === rowName && selected.investorB === colName ? "ring-2 ring-emerald-400" : ""}`}
                  onClick={() => {
                    if (!isDiag && o) setSelected(selected?.investorA === rowName && selected?.investorB === colName ? null : o);
                  }}
                >
                  {(val * 100).toFixed(0)}%
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-1.5 mt-4 text-xs text-gray-500">
        <span>0%</span>
        <div className="w-4 h-3 rounded-sm bg-slate-800 border border-white/10" />
        <div className="w-4 h-3 rounded-sm bg-slate-700/80" />
        <div className="w-4 h-3 rounded-sm bg-emerald-300/20" />
        <div className="w-4 h-3 rounded-sm bg-emerald-400/40" />
        <div className="w-4 h-3 rounded-sm bg-emerald-500/70" />
        <span>100%</span>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="mt-4 p-4 bg-white/[0.03] rounded-xl border border-white/5">
          <div className="text-sm font-medium text-gray-200 mb-3">
            {selected.investorA} × {selected.investorB}
            <span className="text-gray-500 ml-2">
              겹침률 {(selected.overlap * 100).toFixed(0)}%
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-gray-500 mb-1">{selected.investorA}만 보유</div>
              {selected.onlyA.length > 0
                ? selected.onlyA.map((t) => <div key={t} className="text-gray-400">{name(t)}</div>)
                : <div className="text-gray-600">없음</div>}
            </div>
            <div>
              <div className="text-emerald-400 mb-1">공통 보유</div>
              {selected.sharedTickers.length > 0
                ? selected.sharedTickers.map((t) => <div key={t} className="text-gray-300">{name(t)}</div>)
                : <div className="text-gray-600">없음</div>}
            </div>
            <div>
              <div className="text-gray-500 mb-1">{selected.investorB}만 보유</div>
              {selected.onlyB.length > 0
                ? selected.onlyB.map((t) => <div key={t} className="text-gray-400">{name(t)}</div>)
                : <div className="text-gray-600">없음</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
