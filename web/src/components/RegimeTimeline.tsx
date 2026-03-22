"use client";

import { useMemo } from "react";
import type { RegimeSegment } from "@/lib/regime-analysis";
import type { MarketRegime } from "@/lib/data";

interface Props {
  segments: RegimeSegment[];
  regimes: MarketRegime[];
}

const REGIME_STYLE: Record<string, { bg: string; fill: string; label: string }> = {
  bull: { bg: "rgba(34,197,94,0.15)", fill: "#22c55e", label: "강세" },
  neutral: { bg: "rgba(107,114,128,0.12)", fill: "#6b7280", label: "중립" },
  bear: { bg: "rgba(239,68,68,0.15)", fill: "#ef4444", label: "약세" },
};

export default function RegimeTimeline({ segments, regimes }: Props) {
  const { points, minPrice, maxPrice } = useMemo(() => {
    if (regimes.length === 0) return { points: [], minPrice: 0, maxPrice: 0 };

    const prices = regimes.map((r) => r.kospi_price).filter((p) => p > 0);
    const min = Math.min(...prices) * 0.998;
    const max = Math.max(...prices) * 1.002;
    const total = regimes.length;

    const pts = regimes.map((r, i) => ({
      x: (i / Math.max(total - 1, 1)) * 100,
      y: max === min ? 50 : ((r.kospi_price - min) / (max - min)) * 100,
      price: r.kospi_price,
      date: r.date,
    }));

    return { points: pts, minPrice: min, maxPrice: max };
  }, [regimes]);

  if (segments.length === 0) {
    return <p className="text-gray-500 text-sm">레짐 데이터가 없습니다.</p>;
  }

  const segmentTotalDays = segments.reduce((sum, s) => sum + s.days, 0);

  const segmentRanges = useMemo(() => {
    let acc = 0;
    return segments.map((seg) => {
      const startPct = (acc / segmentTotalDays) * 100;
      acc += seg.days;
      const endPct = (acc / segmentTotalDays) * 100;
      return { ...seg, startPct, endPct, widthPct: endPct - startPct };
    });
  }, [segments, segmentTotalDays]);

  const linePath = useMemo(() => {
    if (points.length < 2) return "";
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${100 - p.y}`)
      .join(" ");
  }, [points]);

  const priceLabel = (v: number) =>
    v >= 10000 ? `${(v / 10000).toFixed(1)}만` : v.toLocaleString();

  return (
    <div className="space-y-1.5">
      {/* Chart */}
      <div
        className="relative rounded-xl border border-gray-800 bg-gray-900/30 overflow-hidden"
        style={{ height: 140 }}
      >
        {/* 국면 배경 영역 + 인라인 정보 */}
        {segmentRanges.map((seg, i) => {
          const style = REGIME_STYLE[seg.regime];
          return (
            <div
              key={i}
              className="absolute top-0 bottom-0 flex flex-col items-center justify-start pt-2"
              style={{
                left: `${seg.startPct}%`,
                width: `${seg.widthPct}%`,
                backgroundColor: style.bg,
                borderLeft: i > 0 ? "1px dashed rgba(255,255,255,0.1)" : undefined,
              }}
            >
              {/* 레이블 뱃지 + 기간/일수 */}
              {seg.widthPct > 8 && (
                <div className="flex flex-col items-center gap-0.5 z-10">
                  <span
                    className="text-[10px] font-semibold px-1.5 py-px rounded-full leading-tight"
                    style={{ color: style.fill, backgroundColor: `${style.fill}20` }}
                  >
                    {style.label}
                  </span>
                  <span className="text-[9px] text-gray-500 leading-tight">
                    {seg.days}일
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {/* KOSPI 가격 라인 */}
        {points.length >= 2 && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="kospiGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </linearGradient>
            </defs>
            <path d={`${linePath} L 100 100 L 0 100 Z`} fill="url(#kospiGrad)" />
            <path
              d={linePath}
              fill="none"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth="0.5"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          </svg>
        )}

        {/* Y축 가격 */}
        {maxPrice > 0 && (
          <>
            <span className="absolute top-1 right-2 text-[10px] text-gray-500 tabular-nums">
              {priceLabel(maxPrice)}
            </span>
            <span className="absolute bottom-1 right-2 text-[10px] text-gray-500 tabular-nums">
              {priceLabel(minPrice)}
            </span>
          </>
        )}

        <span className="absolute bottom-1 left-2 text-[10px] text-gray-600">KODEX 200</span>
      </div>

      {/* X축 날짜: 각 세그먼트 시작/끝 */}
      <div className="relative h-3 text-[10px] text-gray-500 tabular-nums">
        <span className="absolute left-0">{regimes[0]?.date.slice(5)}</span>
        {segmentRanges.map((seg, i) => {
          // 세그먼트 경계에 날짜 표시 (첫 번째 제외, 너무 좁은 구간 제외)
          if (i === 0) return null;
          if (seg.startPct < 8 || seg.startPct > 92) return null;
          return (
            <span
              key={i}
              className="absolute"
              style={{ left: `${seg.startPct}%`, transform: "translateX(-50%)" }}
            >
              {seg.start.slice(5)}
            </span>
          );
        })}
        <span className="absolute right-0">{regimes[regimes.length - 1]?.date.slice(5)}</span>
      </div>

      {/* 범례 */}
      <div className="flex gap-4 text-xs text-gray-400 pt-0.5">
        {(["bull", "neutral", "bear"] as const).map((regime) => {
          const days = segments
            .filter((s) => s.regime === regime)
            .reduce((sum, s) => sum + s.days, 0);
          if (days === 0) return null;
          const pct = segmentTotalDays > 0 ? ((days / segmentTotalDays) * 100).toFixed(0) : "0";
          return (
            <div key={regime} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: REGIME_STYLE[regime].fill }}
              />
              <span>
                {REGIME_STYLE[regime].label} {days}일 ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
