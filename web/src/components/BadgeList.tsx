"use client";

import type { Badge } from "@/lib/data";

interface Props {
  badges: Badge[];
}

const BADGE_ICONS: Record<string, string> = {
  first_profit: "★",
  asset_6m: "◆",
  asset_7m: "◇",
  streak_3: "▲",
  streak_5: "▲▲",
  holdings_10: "▦",
  cash_king: "○",
};

const BADGE_COLORS: Record<string, string> = {
  first_profit: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  asset_6m: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  asset_7m: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  streak_3: "bg-red-500/10 text-red-400 border-red-500/20",
  streak_5: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  holdings_10: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  cash_king: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

export default function BadgeList({ badges }: Props) {
  if (badges.length === 0) return null;

  return (
    <section className="glass-card p-4 md:p-5 animate-in">
      <h2 className="text-lg font-bold mb-3 section-header">뱃지</h2>
      <div className="flex flex-wrap gap-2">
        {badges.map((badge, i) => (
          <div
            key={i}
            className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${
              BADGE_COLORS[badge.type] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20"
            }`}
            title={`${badge.description} (${badge.date})`}
          >
            <span>{BADGE_ICONS[badge.type] ?? "●"}</span>
            <span>{badge.description}</span>
            <span className="text-[10px] opacity-60">{badge.date.slice(5)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
