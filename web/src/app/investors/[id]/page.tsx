import {
  getProfile,
  getPortfolio,
  getLatestReportDate,
  getDailyReport,
  getAllocation,
} from "@/lib/data";
import { krw, pct, signColor } from "@/lib/format";
import HoldingsTable from "@/components/HoldingsTable";
import TransactionTable from "@/components/TransactionTable";
import PortfolioChart from "@/components/PortfolioChart";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function InvestorPage({ params }: Props) {
  const { id } = await params;
  const profile = await getProfile(id);
  const portfolio = await getPortfolio(id);
  const latestDate = await getLatestReportDate();

  if (!profile || !portfolio) {
    return (
      <div>
        <p className="text-gray-400">투자자를 찾을 수 없습니다.</p>
      </div>
    );
  }

  const report = latestDate ? await getDailyReport(latestDate) : null;
  const detail = report?.investor_details[profile.name];
  const allocation = latestDate ? await getAllocation(id, latestDate) : null;

  return (
    <div className="space-y-8">
      {/* Header Hero */}
      <div className="animate-in rounded-2xl bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-transparent p-6 lg:p-8 border border-white/5">
        <h1 className="text-3xl font-bold">{profile.name}</h1>
        <p className="text-gray-400 mt-1">{profile.strategy}</p>
        <p className="text-gray-500 text-sm mt-2">{profile.description}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger">
        <div className="glass-card card-shine animate-in p-4">
          <div className="text-gray-400 text-xs uppercase tracking-wider">
            총 자산
          </div>
          <div className="text-lg font-bold mt-1 tabular-nums">
            {detail ? krw(detail.total_asset) : krw(portfolio.initial_capital)}
          </div>
        </div>
        <div className="glass-card card-shine animate-in p-4">
          <div className="text-gray-400 text-xs uppercase tracking-wider">
            수익률
          </div>
          <div
            className={`text-lg font-bold mt-1 tabular-nums ${detail ? signColor(detail.total_return_pct) : "text-gray-500"}`}
          >
            {detail ? pct(detail.total_return_pct) : "0.00%"}
          </div>
        </div>
        <div className="glass-card card-shine animate-in p-4">
          <div className="text-gray-400 text-xs uppercase tracking-wider">
            현금
          </div>
          <div className="text-lg font-bold mt-1 tabular-nums">
            {krw(portfolio.cash)}
          </div>
        </div>
        <div className="glass-card card-shine animate-in p-4">
          <div className="text-gray-400 text-xs uppercase tracking-wider">
            리밸런싱
          </div>
          <div className="text-lg font-bold mt-1">
            {profile.rebalance_frequency_days}일마다
          </div>
          <div className="text-xs text-gray-500">
            총 {portfolio.rebalance_history.length}회
          </div>
        </div>
      </div>

      {/* Profile Info */}
      <section className="glass-card p-5 animate-in">
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

      {/* Portfolio Chart + Holdings */}
      {detail && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="glass-card p-5 animate-in">
              <h2 className="text-lg font-bold mb-3 section-header">
                포트폴리오 구성
              </h2>
              <PortfolioChart detail={detail} />
            </section>

            {allocation && (
              <section className="glass-card p-5 animate-in">
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
                        <div className="flex-1 text-sm">{ticker}</div>
                        <div className="w-32 bg-gray-700/50 rounded-full h-2">
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
          </div>

          <section className="glass-card overflow-hidden animate-in">
            <HoldingsTable holdings={detail.holdings} />
          </section>
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
