import {
  getProfile,
  getPortfolio,
  getLatestReportDate,
  getDailyReport,
  getAllocation,
  getAssetHistory,
  getAssetComposition,
  getSentimentHistory,
  getCashflowHistory,
  getConfig,
  getDailyStories,
  getBadges,
  getLeagueStandings,
  getMarketRegimes,
} from "@/lib/data";
import { krw } from "@/lib/format";
import TransactionTable from "@/components/TransactionTable";
import LiveAttributionSection from "@/components/LiveAttributionSection";
import AssetChart from "@/components/AssetChart";
import AssetCompositionChart from "@/components/AssetCompositionChart";
import SentimentTrendChart from "@/components/SentimentTrendChart";
import LiveInvestorSummary from "@/components/LiveInvestorSummary";
import LiveInvestorDetail from "@/components/LiveInvestorDetail";
import BadgeList from "@/components/BadgeList";
import InvestorAvatar from "@/components/InvestorAvatar";
import InvestorRegimePerformance from "@/components/InvestorRegimePerformance";
import CashflowChart from "@/components/CashflowChart";
import { getMethodology } from "@/lib/methodology";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

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

  const [report, allocation, assetHistory, assetComposition, sentimentHistory, cashflowHistory, stories, allBadges, leagueSeason, regimes] = await Promise.all([
    latestDate ? getDailyReport(latestDate) : null,
    latestDate ? getAllocation(id, latestDate) : null,
    getAssetHistory(profile.name),
    getAssetComposition(id),
    id === "G" ? getSentimentHistory(id) : Promise.resolve([]),
    id === "P" ? getCashflowHistory() : Promise.resolve([]),
    latestDate ? getDailyStories(latestDate) : null,
    getBadges(),
    getLeagueStandings(),
    getMarketRegimes(),
  ]);
  const investorBadges = allBadges.filter((b) => b.investor === profile.name);
  const detail = report?.investor_details[profile.name];
  const diary = stories?.diaries?.[profile.name];
  const methodology = getMethodology(id);

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Back + Header Hero */}
      <Link
        href="/investors"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-300 transition-colors -ml-1"
      >
        <ChevronLeft className="w-4 h-4" />
        투자자 목록
      </Link>
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

      {/* Summary Cards */}
      <LiveInvestorSummary
        detail={detail}
        initialCapital={config.simulation.initial_capital}
        cash={portfolio.cash}
        rebalanceFrequency={profile.rebalance_frequency_days}
        rebalanceCount={portfolio.rebalance_history.length}
      />

      {/* Badges + League Standing (inline) */}
      {(investorBadges.length > 0 || leagueSeason) && (
        <div className="flex flex-wrap items-center gap-2 animate-in">
          {investorBadges.map((badge, i) => (
            <div
              key={i}
              className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${
                ({
                  first_profit: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                  asset_6m: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                  asset_7m: "bg-purple-500/10 text-purple-400 border-purple-500/20",
                  streak_3: "bg-red-500/10 text-red-400 border-red-500/20",
                  streak_5: "bg-orange-500/10 text-orange-400 border-orange-500/20",
                  holdings_10: "bg-blue-500/10 text-blue-400 border-blue-500/20",
                  cash_king: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
                  season_champion: "bg-yellow-500/10 text-yellow-300 border-yellow-500/20",
                  season_champion_2: "bg-amber-500/10 text-amber-300 border-amber-500/20",
                  season_champion_3: "bg-orange-500/10 text-orange-300 border-orange-500/20",
                } as Record<string, string>)[badge.type] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20"
              }`}
              title={`${badge.description} (${badge.date})`}
            >
              <span>{{ first_profit: "★", asset_6m: "◆", asset_7m: "◇", streak_3: "▲", streak_5: "▲▲", holdings_10: "▦", cash_king: "○", season_champion: "🏆", season_champion_2: "🏆", season_champion_3: "🏆" }[badge.type] ?? "●"}</span>
              <span>{badge.description}</span>
            </div>
          ))}
          {leagueSeason && (() => {
            const standing = leagueSeason.standings.find((s) => s.investorId === id);
            if (!standing) return null;
            return (
              <a
                href="/league"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border bg-yellow-500/10 text-yellow-300 border-yellow-500/20 hover:bg-yellow-500/20 transition-colors"
              >
                <span>🏆</span>
                <span>{leagueSeason.seasonName} {standing.rank}위 · {standing.points}점</span>
              </a>
            );
          })()}
        </div>
      )}

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

      {/* Portfolio Chart + Allocation + Holdings */}
      {detail && (
        <LiveInvestorDetail
          detail={detail}
          initialCapital={config.simulation.initial_capital}
          allocation={allocation}
          marketPrices={report?.market_prices}
        />
      )}

      {/* Attribution Analysis */}
      {detail && Object.keys(detail.holdings).length > 0 && (
        <LiveAttributionSection
          detail={detail}
          initialCapital={config.simulation.initial_capital}
          investorName={profile.name}
          investorId={id}
          stockUniverse={config.stock_universe}
        />
      )}

      {/* Regime Performance */}
      {regimes.length > 0 && assetHistory.length >= 2 && (
        <InvestorRegimePerformance regimes={regimes} assetHistory={assetHistory} />
      )}

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

      {/* Asset Composition Chart */}
      {assetComposition.length >= 2 && (
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-3 section-header">자산 구성 변화</h2>
          <AssetCompositionChart data={assetComposition} />
        </section>
      )}

      {/* Sentiment Trend (G only) */}
      {id === "G" && sentimentHistory.length >= 2 && (
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-3 section-header">감성 점수 추이</h2>
          <p className="text-xs text-gray-500 mb-3">뉴스 감성 분석 평균 점수 (-1.0 부정 ~ +1.0 긍정)</p>
          <SentimentTrendChart data={sentimentHistory} />
        </section>
      )}

      {/* Cashflow Account (P only) */}
      {id === "P" && cashflowHistory.length >= 1 && (
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-2 section-header">현금흐름 통장</h2>
          <p className="text-xs text-gray-500 mb-3">
            매일 500만원 baseline으로 리셋. 일일 손익은 cashflow_account에 별도 정산.
            {cashflowHistory.length > 0 && (
              <span className={`ml-2 font-mono font-bold ${
                cashflowHistory[cashflowHistory.length - 1].cashflow_account >= 0
                  ? "text-red-400" : "text-blue-400"
              }`}>
                누적: {krw(cashflowHistory[cashflowHistory.length - 1].cashflow_account)}
              </span>
            )}
          </p>
          <CashflowChart data={cashflowHistory} />
        </section>
      )}

      {/* Transaction History */}
      {portfolio.transactions.length > 0 && (
        <section className="glass-card overflow-hidden animate-in">
          {(() => {
            const totalFees = portfolio.transactions.reduce(
              (sum, t) => sum + (t.fee ?? 0),
              0
            );
            return totalFees > 0 ? (
              <div className="px-4 pt-3 flex items-center gap-2 text-sm text-yellow-500">
                <span>누적 거래비용</span>
                <span className="font-mono font-bold">{krw(totalFees)}</span>
              </div>
            ) : null;
          })()}
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
