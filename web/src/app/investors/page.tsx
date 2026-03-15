import Link from "next/link";
import {
  getConfig,
  getLatestReportDate,
  getDailyReport,
  getProfile,
} from "@/lib/data";
import InvestorAvatar from "@/components/InvestorAvatar";
import { getInvestorColor } from "@/lib/investor-colors";
import { pct, signColor } from "@/lib/format";

export const dynamic = "force-dynamic";

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

export default async function InvestorsPage() {
  const [config, latestDate] = await Promise.all([
    getConfig(),
    getLatestReportDate(),
  ]);

  const report = latestDate ? await getDailyReport(latestDate) : null;

  const investors = await Promise.all(
    config.investors.map(async (inv) => {
      const profile = await getProfile(inv.id);
      const ranking = report?.rankings.find((r) => r.investor === inv.name);
      return { inv, profile, ranking };
    })
  );

  // 순위 기준 정렬 (순위 없으면 뒤로)
  investors.sort((a, b) => {
    if (!a.ranking) return 1;
    if (!b.ranking) return -1;
    return a.ranking.rank - b.ranking.rank;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">투자자</h1>
        <p className="text-gray-500 text-sm mt-1">
          {investors.length}명 · {latestDate ?? "—"} 기준
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {investors.map(({ inv, profile, ranking }) => {
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
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  {profile?.strategy ?? "—"}
                </p>
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
    </div>
  );
}
