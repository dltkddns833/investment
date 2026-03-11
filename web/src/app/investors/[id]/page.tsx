import {
  getProfile,
  getPortfolio,
  getLatestReportDate,
  getDailyReport,
  getAllocation,
  getAssetHistory,
  getConfig,
  getDailyStories,
} from "@/lib/data";
import TransactionTable from "@/components/TransactionTable";
import AssetChart from "@/components/AssetChart";
import LiveInvestorSummary from "@/components/LiveInvestorSummary";
import LiveInvestorDetail from "@/components/LiveInvestorDetail";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function InvestorPage({ params }: Props) {
  const { id } = await params;
  const [profile, portfolio, latestDate, config] = await Promise.all([
    getProfile(id),
    getPortfolio(id),
    getLatestReportDate(),
    getConfig(),
  ]);

  if (!profile || !portfolio) {
    return (
      <div>
        <p className="text-gray-400">투자자를 찾을 수 없습니다.</p>
      </div>
    );
  }

  const [report, allocation, assetHistory, stories] = await Promise.all([
    latestDate ? getDailyReport(latestDate) : null,
    latestDate ? getAllocation(id, latestDate) : null,
    getAssetHistory(profile.name),
    latestDate ? getDailyStories(latestDate) : null,
  ]);
  const detail = report?.investor_details[profile.name];
  const diary = stories?.diaries?.[profile.name];

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header Hero */}
      <div className="animate-in rounded-2xl bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-transparent p-4 md:p-6 lg:p-8 border border-white/5">
        <h1 className="text-2xl md:text-3xl font-bold">{profile.name}</h1>
        <p className="text-gray-400 mt-1">{profile.strategy}</p>
        <p className="text-gray-500 text-sm mt-2">{profile.description}</p>
      </div>

      {/* Diary */}
      {diary && (
        <section className="glass-card animate-in p-4 md:p-5 border-l-2 border-l-purple-400/50">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-bold text-purple-300">오늘의 일기</h2>
            <span className="text-xs text-gray-500">{latestDate}</span>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed italic">
            &ldquo;{diary}&rdquo;
          </p>
        </section>
      )}

      {/* Summary Cards */}
      <LiveInvestorSummary
        detail={detail}
        initialCapital={config.simulation.initial_capital}
        cash={portfolio.cash}
        rebalanceFrequency={profile.rebalance_frequency_days}
        rebalanceCount={portfolio.rebalance_history.length}
      />

      {/* Asset History Chart */}
      {assetHistory.length >= 1 && (
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-3 section-header">자산 추이</h2>
          <AssetChart
            data={assetHistory}
            initialCapital={portfolio.initial_capital}
          />
        </section>
      )}

      {/* Profile Info */}
      <section className="glass-card p-4 md:p-5 animate-in">
        <h2 className="text-lg font-bold mb-3 section-header">분석 기준</h2>
        <div className="flex flex-wrap gap-2">
          {profile.analysis_criteria.map((c, i) => (
            <span
              key={i}
              className="badge-glow text-xs px-3 py-1 rounded-full"
            >
              {c}
            </span>
          ))}
        </div>
      </section>

      {/* Portfolio Chart + Holdings + Allocation */}
      {detail && (
        <>
          <LiveInvestorDetail
            detail={detail}
            initialCapital={config.simulation.initial_capital}
          />

          {allocation && (
            <section className="glass-card p-4 md:p-5 animate-in">
              <h2 className="text-lg font-bold mb-3 section-header">
                목표 배분
              </h2>
              <p className="text-xs text-gray-400 mb-3">
                {allocation.rationale}
              </p>
              <div className="space-y-2">
                {Object.entries(allocation.allocation).map(
                  ([ticker, ratio]) => (
                    <div key={ticker} className="flex items-center gap-2">
                      <div className="w-16 md:w-20 text-sm truncate shrink-0">
                        {report!.market_prices[ticker]?.name ?? ticker}
                      </div>
                      <div className="flex-1 bg-gray-700/50 rounded-full h-2">
                        <div
                          className="bar-fill h-2"
                          style={{ width: `${ratio * 100}%` }}
                        />
                      </div>
                      <div className="text-sm text-gray-400 w-12 text-right tabular-nums">
                        {(ratio * 100).toFixed(0)}%
                      </div>
                    </div>
                  )
                )}
              </div>
            </section>
          )}
        </>
      )}

      {/* Transaction History */}
      {portfolio.transactions.length > 0 && (
        <section className="glass-card overflow-hidden animate-in">
          <TransactionTable transactions={portfolio.transactions} />
        </section>
      )}
    </div>
  );
}
