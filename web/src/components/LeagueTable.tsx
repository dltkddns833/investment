import Link from "next/link";
import type { LeagueStanding } from "@/lib/data";
import InvestorAvatar from "./InvestorAvatar";

interface Props {
  standings: LeagueStanding[];
  tradingDays: number;
  maxPoints: number;
}

export default function LeagueTable({ standings, tradingDays, maxPoints }: Props) {
  const medal = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `${rank}`;
  };

  return (
    <section className="glass-card p-4 md:p-5 animate-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold section-header">승점 순위</h2>
        <span className="text-xs text-gray-500">{tradingDays}거래일 진행</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="px-3 py-2 text-xs font-medium text-gray-400 text-center w-14">순위</th>
              <th className="px-3 py-2 text-xs font-medium text-gray-400 text-left">투자자</th>
              <th className="px-3 py-2 text-xs font-medium text-gray-400 text-right">승점</th>
              <th className="px-3 py-2 text-xs font-medium text-gray-400 text-right hidden sm:table-cell">평균 순위</th>
              <th className="px-3 py-2 text-xs font-medium text-gray-400 text-right hidden sm:table-cell">1위 횟수</th>
              <th className="px-3 py-2 text-xs font-medium text-gray-400 text-right hidden md:table-cell">승점/일</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr
                key={s.investorId}
                className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${
                  s.rank === 1 ? "bg-yellow-500/[0.03]" : ""
                }`}
              >
                <td className="px-3 py-2.5 text-center tabular-nums font-medium">
                  {medal(s.rank)}
                </td>
                <td className="px-3 py-2.5">
                  <Link
                    href={`/investors/${s.investorId}`}
                    className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                  >
                    <InvestorAvatar investorId={s.investorId} size="sm" />
                    <span className="font-medium text-gray-200">{s.investor}</span>
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden hidden sm:block">
                      <div
                        className="h-full bg-gradient-to-r from-yellow-500/60 to-yellow-400/80 rounded-full"
                        style={{ width: `${maxPoints > 0 ? (s.points / maxPoints) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="font-bold tabular-nums text-yellow-300">{s.points}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-gray-400 hidden sm:table-cell">
                  {s.avgRank}위
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-gray-400 hidden sm:table-cell">
                  {s.rank1Days}회
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-gray-400 hidden md:table-cell">
                  {s.pointsPerDay}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
