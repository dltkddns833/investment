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

interface Props {
  searchParams: Promise<{ season?: string }>;
}

export default async function LeaguePage({ searchParams }: Props) {
  const params = await searchParams;
  const selectedSeason = params.season;

  const [config, currentSeason, seasonHistory] = await Promise.all([
    getConfig(),
    getLeagueStandings(),
    getSeasonHistory(),
  ]);

  // 과거 시즌 선택 시 해당 시즌 데이터 로드
  const viewSeason = selectedSeason
    ? await getLeagueStandings(selectedSeason)
    : null;
  const viewDailyPoints = selectedSeason
    ? await getDailyLeaguePoints(selectedSeason)
    : null;

  const investorNames = config.investors.map((inv) => inv.name);
  const investorIds = config.investors.map((inv) => inv.id);

  const dailyPoints = currentSeason
    ? await getDailyLeaguePoints(currentSeason.seasonLabel)
    : [];

  const activeSeason = viewSeason ?? currentSeason;
  const activePoints = viewDailyPoints ?? dailyPoints;

  const maxPoints = activeSeason
    ? Math.max(...activeSeason.standings.map((s) => s.points), 1)
    : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">
          투자자 리그
        </h1>
        {activeSeason && (
          <p className="text-gray-400 mt-1 text-sm">
            {activeSeason.seasonName} · {activeSeason.isCurrent ? "진행 중" : "종료"}
          </p>
        )}
      </div>

      {activeSeason ? (
        <>
          <LeagueTable
            standings={activeSeason.standings}
            tradingDays={activeSeason.tradingDays}
            maxPoints={maxPoints}
          />

          {activePoints.length > 1 && (
            <LeaguePointsChart
              data={activePoints}
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

      <SeasonHistory
        seasons={seasonHistory}
        selectedSeason={selectedSeason}
      />
    </div>
  );
}
