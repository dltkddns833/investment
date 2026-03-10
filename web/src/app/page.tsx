import {
  getLatestReportDate,
  getDailyReport,
  getConfig,
  getNews,
} from "@/lib/data";
import { krw, pct, signColor } from "@/lib/format";
import RankingTable from "@/components/RankingTable";
import MarketTable from "@/components/MarketTable";

export const dynamic = "force-dynamic";

export default function Home() {
  const config = getConfig();
  const latestDate = getLatestReportDate();

  if (!latestDate) {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-4">모의 투자 시뮬레이션</h1>
        <p className="text-gray-400">
          아직 리포트가 없습니다. 시뮬레이션을 먼저 실행해주세요.
        </p>
      </div>
    );
  }

  const report = getDailyReport(latestDate)!;
  const news = getNews(latestDate);

  const investorIds: Record<string, string> = {};
  for (const inv of config.investors) {
    investorIds[inv.name] = inv.id;
  }

  const totalInvested =
    config.simulation.initial_capital * config.investors.length;
  const totalAsset = report.rankings.reduce((s, r) => s + r.total_asset, 0);
  const totalReturn = totalAsset - totalInvested;
  const totalReturnPct = (totalAsset / totalInvested - 1) * 100;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">모의 투자 시뮬레이션</h1>
        <p className="text-gray-400 mt-1">{report.date} 기준</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
          <div className="text-gray-400 text-sm">총 투자금</div>
          <div className="text-xl font-bold mt-1">{krw(totalInvested)}</div>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
          <div className="text-gray-400 text-sm">총 자산</div>
          <div className="text-xl font-bold mt-1">{krw(totalAsset)}</div>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
          <div className="text-gray-400 text-sm">총 수익</div>
          <div
            className={`text-xl font-bold mt-1 ${signColor(totalReturn)}`}
          >
            {totalReturn >= 0 ? "+" : ""}
            {krw(totalReturn)}
          </div>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
          <div className="text-gray-400 text-sm">평균 수익률</div>
          <div
            className={`text-xl font-bold mt-1 ${signColor(totalReturnPct)}`}
          >
            {pct(totalReturnPct)}
          </div>
        </div>
      </div>

      {/* Rankings */}
      <section className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-5 border-b border-gray-700">
          <h2 className="text-xl font-bold">투자자 순위</h2>
        </div>
        <RankingTable rankings={report.rankings} investorIds={investorIds} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Market */}
        <section className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden">
          <div className="p-5 border-b border-gray-700">
            <h2 className="text-xl font-bold">시장 현황</h2>
          </div>
          <MarketTable prices={report.market_prices} />
        </section>

        {/* News */}
        <section className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden">
          <div className="p-5 border-b border-gray-700">
            <h2 className="text-xl font-bold">오늘의 뉴스</h2>
            {news && (
              <span className="text-gray-400 text-sm ml-2">
                {news.count}건
              </span>
            )}
          </div>
          <div className="p-5 space-y-3 max-h-[500px] overflow-y-auto">
            {news ? (
              news.articles.map((article, i) => (
                <div
                  key={i}
                  className="border-b border-gray-800/50 pb-3 last:border-0"
                >
                  <div className="font-medium text-sm">{article.title}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {article.summary}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {article.category} · {article.source}
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
      <div className="text-center text-gray-600 text-xs py-4">
        생성: {report.generated_at}
      </div>
    </div>
  );
}
