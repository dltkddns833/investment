import {
  getLeagueStandings,
  getSeasonHistory,
  getDailyLeaguePoints,
  getConfig,
} from "@/lib/data";
import LeagueTable from "@/components/LeagueTable";
import LeaguePointsChart from "@/components/LeaguePointsChart";
import SeasonHistory from "@/components/SeasonHistory";

export const dynamic = "force-dynamic";

export default async function LeaguePage() {
  const [config, currentSeason, seasonHistory] = await Promise.all([
    getConfig(),
    getLeagueStandings(),
    getSeasonHistory(),
  ]);

  const investorNames = config.investors.map((inv) => inv.name);
  const investorIds = config.investors.map((inv) => inv.id);

  const dailyPoints = currentSeason
    ? await getDailyLeaguePoints(currentSeason.seasonLabel)
    : [];

  const maxPoints = currentSeason
    ? Math.max(...currentSeason.standings.map((s) => s.points), 1)
    : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">
          투자자 리그
        </h1>
        {currentSeason && (
          <p className="text-gray-400 mt-1 text-sm">
            {currentSeason.seasonName} · {currentSeason.isCurrent ? "진행 중" : "종료"}
          </p>
        )}
      </div>

      {currentSeason ? (
        <>
          <LeagueTable
            standings={currentSeason.standings}
            tradingDays={currentSeason.tradingDays}
            maxPoints={maxPoints}
          />

          {dailyPoints.length > 1 && (
            <LeaguePointsChart
              data={dailyPoints}
              investorNames={investorNames}
              investorIds={investorIds}
            />
          )}
        </>
      ) : (
        <div className="glass-card p-6 text-center">
          <p className="text-gray-400">아직 이번 달 시뮬레이션 데이터가 없습니다.</p>
        </div>
      )}

      <SeasonHistory seasons={seasonHistory} />
    </div>
  );
}
