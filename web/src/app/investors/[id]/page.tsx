import {
  getProfile,
  getPortfolio,
  getLatestReportDate,
  getDailyReport,
  getAllocation,
  getAssetHistory,
  getConfig,
  getDailyStories,
  getBadges,
} from "@/lib/data";
import TransactionTable from "@/components/TransactionTable";
import AssetChart from "@/components/AssetChart";
import LiveInvestorSummary from "@/components/LiveInvestorSummary";
import LiveInvestorDetail from "@/components/LiveInvestorDetail";
import BadgeList from "@/components/BadgeList";
import InvestorAvatar from "@/components/InvestorAvatar";
import { getMethodology } from "@/lib/methodology";

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

  const [report, allocation, assetHistory, stories, allBadges] = await Promise.all([
    latestDate ? getDailyReport(latestDate) : null,
    latestDate ? getAllocation(id, latestDate) : null,
    getAssetHistory(profile.name),
    latestDate ? getDailyStories(latestDate) : null,
    getBadges(),
  ]);
  const investorBadges = allBadges.filter((b) => b.investor === profile.name);
  const detail = report?.investor_details[profile.name];
  const diary = stories?.diaries?.[profile.name];
  const methodology = getMethodology(id);

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header Hero */}
      <div className="animate-in rounded-2xl bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-transparent p-4 md:p-6 lg:p-8 border border-white/5">
        <div className="flex items-center gap-3 md:gap-4">
          <InvestorAvatar investorId={id} size="lg" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">{profile.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-gray-400">{profile.strategy}</p>
              {profile.risk_grade && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  profile.risk_grade === "안정형"    ? "bg-blue-500/15 text-blue-300" :
                  profile.risk_grade === "안정추구형" ? "bg-lime-500/15 text-lime-300" :
                  profile.risk_grade === "위험중립형" ? "bg-green-500/15 text-green-300" :
                  profile.risk_grade === "적극투자형" ? "bg-yellow-500/15 text-yellow-300" :
                  profile.risk_grade === "공격투자형" ? "bg-red-500/15 text-red-300" :
                  "bg-gray-500/15 text-gray-300"
                }`}>
                  {profile.risk_grade}
                </span>
              )}
            </div>
          </div>
        </div>
        <p className="text-gray-500 text-sm mt-3">{profile.description}</p>
      </div>

      {/* Badges */}
      <BadgeList badges={investorBadges} />

      {/* Diary */}
      {diary && (
        <section className="glass-card animate-in p-4 md:p-5 border-l-2 border-l-purple-400/50">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-bold text-purple-300">오늘의 일기</h2>
            <span className="text-xs text-gray-500">{latestDate}</span>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed italic whitespace-pre-line">
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

      {/* Portfolio Chart + Holdings */}
      {detail && (
        <LiveInvestorDetail
          detail={detail}
          initialCapital={config.simulation.initial_capital}
        />
      )}

      {/* Allocation */}
      {detail && allocation && (
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-3 section-header">
            목표 배분
          </h2>
          <p className="text-xs text-gray-400 mb-3 whitespace-pre-line">
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

      {/* Transaction History */}
      {portfolio.transactions.length > 0 && (
        <section className="glass-card overflow-hidden animate-in">
          <TransactionTable transactions={portfolio.transactions} />
        </section>
      )}

      {/* Methodology */}
      {methodology && (
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-4 section-header">투자 방법론</h2>
          <div className="space-y-3">
            <div>
              <span className="text-xs text-gray-500">방법론</span>
              <p className="text-sm text-blue-300 font-medium mt-0.5">
                {methodology.method}
              </p>
            </div>
            <div>
              <span className="text-xs text-gray-500">대표 인물</span>
              <p className="text-sm text-gray-300 mt-0.5">
                {methodology.representative}
              </p>
            </div>
            <div>
              <span className="text-xs text-gray-500">핵심 원리</span>
              <p className="text-sm text-gray-300 mt-0.5 leading-relaxed">
                {methodology.core}
              </p>
            </div>
            <div>
              <span className="text-xs text-gray-500">학술 / 실증 근거</span>
              <p className="text-sm text-gray-400 mt-0.5 leading-relaxed">
                {methodology.evidence}
              </p>
            </div>
            <div>
              <span className="text-xs text-gray-500">유사 전략</span>
              <p className="text-sm text-purple-300/80 mt-0.5">
                {methodology.similar}
              </p>
            </div>
            <div>
              <span className="text-xs text-gray-500">참고 자료</span>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {methodology.links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400 hover:text-blue-300 hover:border-blue-400/30 transition-colors"
                  >
                    <span>{link.label}</span>
                    <svg
                      className="w-3 h-3 shrink-0 opacity-50"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          </div>
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
    </div>
  );
}
