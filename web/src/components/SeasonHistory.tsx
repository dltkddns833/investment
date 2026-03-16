"use client";

import type { SeasonSummary } from "@/lib/data";
import InvestorAvatar from "./InvestorAvatar";

interface Props {
  seasons: SeasonSummary[];
}

export default function SeasonHistory({ seasons }: Props) {
  if (seasons.length === 0) {
    return (
      <section className="glass-card p-4 md:p-5 animate-in">
        <h2 className="text-lg font-bold mb-3 section-header">시즌 아카이브</h2>
        <p className="text-sm text-gray-500">아직 완료된 시즌이 없습니다. 첫 시즌 진행 중!</p>
      </section>
    );
  }

  return (
    <section className="glass-card p-4 md:p-5 animate-in">
      <h2 className="text-lg font-bold mb-4 section-header">시즌 아카이브</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {seasons.map((season) => {
          const top3 = season.standings.slice(0, 3);
          return (
            <div
              key={season.seasonLabel}
              className="rounded-xl border border-white/5 bg-white/[0.02] p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm text-gray-200">{season.seasonName}</h3>
                <span className="text-xs text-gray-500">{season.tradingDays}거래일</span>
              </div>

              {/* 우승자 */}
              {season.champion && (
                <div className="flex items-center gap-2.5 mb-3 p-2 rounded-lg bg-yellow-500/[0.05] border border-yellow-500/10">
                  <span className="text-xl">🏆</span>
                  <InvestorAvatar investorId={season.champion.investorId} size="sm" />
                  <div>
                    <p className="text-sm font-bold text-yellow-300">{season.champion.investor}</p>
                    <p className="text-xs text-gray-400">{season.champion.points}점</p>
                  </div>
                </div>
              )}

              {/* Top 3 */}
              <div className="space-y-1.5">
                {top3.map((s) => (
                  <div
                    key={s.investorId}
                    className="flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 text-center">
                        {s.rank === 1 ? "🥇" : s.rank === 2 ? "🥈" : "🥉"}
                      </span>
                      <span className="text-gray-300">{s.investor}</span>
                    </div>
                    <span className="tabular-nums text-gray-400">{s.points}점</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
