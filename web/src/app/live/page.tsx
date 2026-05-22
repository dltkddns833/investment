import {
  getPortfolio,
  getInvestorSnapshots,
  getDailyStories,
  getLatestReportDate,
  getConfig,
} from "@/lib/data";
import LiveUFView from "@/components/LiveUFView";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const [portfolio, latestDate, config] = await Promise.all([
    getPortfolio("UF"),
    getLatestReportDate(),
    getConfig(),
  ]);

  if (!portfolio) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">실전 투자</h1>
        <div className="bg-gray-800/50 rounded-xl p-8 text-center text-gray-400">
          UF 이상운 트랙 데이터가 아직 없습니다.
        </div>
      </div>
    );
  }

  const seasonStartDate = (config.simulation as { season2_start_date?: string }).season2_start_date ?? "2026-05-22";
  const initialCapital = config.simulation.initial_capital ?? 10_000_000;

  const [snapshots, stories] = await Promise.all([
    getInvestorSnapshots("UF", seasonStartDate),
    latestDate ? getDailyStories(latestDate) : null,
  ]);

  const diary = stories?.diaries?.["이상운"] ?? null;

  return (
    <LiveUFView
      portfolio={portfolio}
      snapshots={snapshots}
      diary={diary}
      latestDate={latestDate}
      initialCapital={initialCapital}
      seasonStartDate={seasonStartDate}
    />
  );
}
