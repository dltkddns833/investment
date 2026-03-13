"use client";

import type { WeeklyMVP, InvestorStreak } from "@/lib/data";
import { pct, signColor } from "@/lib/format";

interface Props {
  latestWeek: WeeklyMVP | null;
  streaks: InvestorStreak[];
}

export default function WeeklyHighlights({ latestWeek, streaks }: Props) {
  const activeStreaks = streaks.filter((s) => s.currentRank1Streak >= 2);

  if (!latestWeek && activeStreaks.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in">
      {latestWeek && (
        <>
          <div className="glass-card p-3">
            <div className="text-[10px] text-gray-500 mb-1">이번 주 MVP</div>
            <div className="text-sm font-bold text-amber-400">{latestWeek.mvp.investor}</div>
            <div className={`text-xs ${signColor(latestWeek.mvp.returnPct)}`}>
              {pct(latestWeek.mvp.returnPct)}
            </div>
          </div>
          <div className="glass-card p-3">
            <div className="text-[10px] text-gray-500 mb-1">이번 주 꼴찌</div>
            <div className="text-sm font-bold text-gray-400">{latestWeek.worst.investor}</div>
            <div className={`text-xs ${signColor(latestWeek.worst.returnPct)}`}>
              {pct(latestWeek.worst.returnPct)}
            </div>
          </div>
        </>
      )}
      <div className="glass-card p-3">
        <div className="text-[10px] text-gray-500 mb-1">연승 기록</div>
        {activeStreaks.length > 0 ? (
          <div className="space-y-1">
            {activeStreaks.map((s) => (
              <div key={s.investor} className="text-xs">
                <span className="text-gray-200 font-medium">{s.investor}</span>
                <span className="text-red-400 ml-1">{s.currentRank1Streak}일 연속 1위</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-600">활성 연승 없음</div>
        )}
      </div>
    </div>
  );
}
