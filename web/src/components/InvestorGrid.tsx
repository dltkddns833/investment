"use client";

import Link from "next/link";
import { RankingEntry, InvestorDetail } from "@/lib/data";
import { useLiveRankings } from "@/lib/use-live-portfolio";
import { getInvestorColor } from "@/lib/investor-colors";
import { pct, signColor } from "@/lib/format";
import InvestorAvatar from "./InvestorAvatar";

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

interface InvestorInfo {
  id: string;
  name: string;
  strategy: string;
  riskGrade: string;
}

interface Props {
  investors: InvestorInfo[];
  rankings: RankingEntry[];
  investorDetails: Record<string, InvestorDetail>;
  initialCapital: number;
}

export default function InvestorGrid({
  investors,
  rankings,
  investorDetails,
  initialCapital,
}: Props) {
  const liveRankings = useLiveRankings(
    rankings,
    investorDetails,
    initialCapital
  );

  const rankMap = new Map(liveRankings.map((r) => [r.investor, r]));

  const sorted = [...investors].sort((a, b) => {
    const ra = rankMap.get(a.name);
    const rb = rankMap.get(b.name);
    if (!ra) return 1;
    if (!rb) return -1;
    return ra.rank - rb.rank;
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {sorted.map((inv) => {
        const ranking = rankMap.get(inv.name);
        const color = getInvestorColor(inv.id);
        const medal = ranking ? RANK_MEDALS[ranking.rank - 1] ?? null : null;

        return (
          <Link
            key={inv.id}
            href={`/investors/${inv.id}`}
            className="glass-card p-4 flex items-start gap-3 hover:bg-white/5 transition-colors group"
            style={{ borderLeft: `3px solid ${color.primary}40` }}
          >
            <InvestorAvatar investorId={inv.id} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {medal && <span className="text-base">{medal}</span>}
                {!medal && ranking && (
                  <span className="text-xs text-gray-500 font-mono w-5 text-center">
                    {ranking.rank}
                  </span>
                )}
                <span className="font-semibold text-sm group-hover:text-white transition-colors">
                  {inv.name}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-xs text-gray-500 truncate">
                  {inv.strategy}
                </p>
                {inv.riskGrade && (
                  <span
                    className={`shrink-0 text-xs px-1.5 py-0 rounded-full font-medium ${
                      inv.riskGrade === "안정형"
                        ? "bg-blue-500/15 text-blue-300"
                        : inv.riskGrade === "안정추구형"
                          ? "bg-lime-500/15 text-lime-300"
                          : inv.riskGrade === "위험중립형"
                            ? "bg-green-500/15 text-green-300"
                            : inv.riskGrade === "적극투자형"
                              ? "bg-yellow-500/15 text-yellow-300"
                              : inv.riskGrade === "공격투자형"
                                ? "bg-red-500/15 text-red-300"
                                : "bg-gray-500/15 text-gray-300"
                    }`}
                  >
                    {inv.riskGrade}
                  </span>
                )}
              </div>
              {ranking && (
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className={`text-sm font-bold tabular-nums ${signColor(ranking.total_return_pct)}`}
                  >
                    {pct(ranking.total_return_pct)}
                  </span>
                  <span className="text-xs text-gray-600">
                    {ranking.num_holdings}종목
                  </span>
                </div>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
