import {
  getLatestReportDate,
  getDailyReport,
  getConfig,
  getNews,
  getAllAssetHistory,
} from "@/lib/data";
import { krw, pct, signColor } from "@/lib/format";
import RankingTable from "@/components/RankingTable";
import MarketTable from "@/components/MarketTable";
import AllInvestorsAssetChart from "@/components/AllInvestorsAssetChart";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [config, latestDate] = await Promise.all([
    getConfig(),
    getLatestReportDate(),
  ]);

  if (!latestDate) {
    return (
      <div>
        <h1 className="text-2xl md:text-3xl font-bold mb-4">모의 투자 시뮬레이션</h1>
        <p className="text-gray-400">
          아직 리포트가 없습니다. 시뮬레이션을 먼저 실행해주세요.
        </p>
      </div>
    );
  }

  const investorNames = config.investors.map((inv) => inv.name);

  const [report, news, assetHistory] = await Promise.all([
    getDailyReport(latestDate).then((r) => r!),
    getNews(latestDate),
    getAllAssetHistory(investorNames),
  ]);

  const investorIds: Record<string, string> = {};
  for (const inv of config.investors) {
    investorIds[inv.name] = inv.id;
  }

  const totalInvested =
    config.simulation.initial_capital * config.investors.length;
  const totalAsset = report.rankings.reduce((s, r) => s + r.total_asset, 0);
  const totalReturn = totalAsset - totalInvested;
  const totalReturnPct = (totalAsset / totalInvested - 1) * 100;

  const returnBorderColor =
    totalReturn > 0
      ? "border-t-2 border-t-red-400/50"
      : totalReturn < 0
        ? "border-t-2 border-t-blue-400/50"
        : "";

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <div className="animate-in">
        <h1 className="text-2xl md:text-3xl font-bold">모의 투자 시뮬레이션</h1>
        <p className="text-gray-400 mt-1">{report.date} 기준</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 stagger">
        <div className="glass-card card-shine animate-in p-3 md:p-5">
          <div className="text-gray-400 text-xs uppercase tracking-wider">
            총 투자금
          </div>
          <div className="text-lg md:text-2xl font-bold mt-1 tabular-nums">
            {krw(totalInvested)}
          </div>
        </div>
        <div className="glass-card card-shine animate-in p-3 md:p-5">
          <div className="text-gray-400 text-xs uppercase tracking-wider">
            총 자산
          </div>
          <div className="text-lg md:text-2xl font-bold mt-1 tabular-nums">
            {krw(totalAsset)}
          </div>
        </div>
        <div className={`glass-card card-shine animate-in p-3 md:p-5 ${returnBorderColor}`}>
          <div className="text-gray-400 text-xs uppercase tracking-wider">
            총 수익
          </div>
          <div
            className={`text-lg md:text-2xl font-bold mt-1 tabular-nums ${signColor(totalReturn)}`}
          >
            {totalReturn >= 0 ? "+" : ""}
            {krw(totalReturn)}
          </div>
        </div>
        <div className={`glass-card card-shine animate-in p-3 md:p-5 ${returnBorderColor}`}>
          <div className="text-gray-400 text-xs uppercase tracking-wider">
            평균 수익률
          </div>
          <div
            className={`text-lg md:text-2xl font-bold mt-1 tabular-nums ${signColor(totalReturnPct)}`}
          >
            {pct(totalReturnPct)}
          </div>
        </div>
      </div>

      {/* Rankings */}
      <section className="glass-card overflow-hidden animate-in">
        <RankingTable rankings={report.rankings} investorIds={investorIds} />
      </section>

      {/* All Investors Asset History */}
      {assetHistory.length >= 1 && (
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-3 section-header">자산 추이</h2>
          <AllInvestorsAssetChart
            data={assetHistory}
            investorNames={investorNames}
            initialCapital={config.simulation.initial_capital}
          />
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Market */}
        <section className="glass-card overflow-hidden animate-in">
          <MarketTable prices={report.market_prices} />
        </section>

        {/* News */}
        <section className="glass-card overflow-hidden animate-in">
          <div className="py-4 px-4 border-b border-white/5">
            <h2 className="text-xl font-bold section-header">
              오늘의 뉴스
              {news && (
                <span className="text-gray-400 text-sm font-normal ml-2">
                  {news.count}건
                </span>
              )}
            </h2>
          </div>
          <div className="p-4 md:p-5 space-y-2">
            {news ? (
              news.articles.map((article, i) => (
                <div
                  key={i}
                  className="bg-white/[0.02] hover:bg-white/[0.05] rounded-lg p-3 transition-all duration-200 hover:-translate-y-0.5"
                >
                  <div className="font-medium text-sm">{article.title}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {article.summary}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                      {article.category}
                    </span>
                    <span className="text-xs text-gray-500">
                      {article.source}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-gray-500">뉴스 없음</div>
            )}
          </div>
        </section>
      </div>

      {/* Footer */}
      <div>
        <div className="gradient-separator" />
        <div className="text-center text-gray-600 text-xs py-4">
          {new Date(report.generated_at).toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}{" "}
          {new Date(report.generated_at).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}{" "}
          기준 · 모의투자 시뮬레이션
        </div>
      </div>
    </div>
  );
}
