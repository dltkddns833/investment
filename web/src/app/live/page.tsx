import {
  getRealPortfolioHistory,
  getLatestRealPortfolio,
  getMetaDecisions,
  getConfig,
  getProfile,
  getInvestorSnapshots,
  getAllocationByInvestorName,
  getDailyStories,
} from "@/lib/data";
import LivePortfolioView, { type FollowInfo } from "@/components/LivePortfolioView";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const [portfolio, history, decisions, config] = await Promise.all([
    getLatestRealPortfolio(),
    getRealPortfolioHistory(),
    getMetaDecisions(),
    getConfig(),
  ]);

  const stories = portfolio ? await getDailyStories(portfolio.date) : null;
  const metaDiary = stories?.diaries?.["메타"] ?? null;

  const stockMap = Object.fromEntries(
    config.stock_universe.map((s) => [s.ticker, s])
  );
  const stockNameMap = Object.fromEntries(
    config.stock_universe.map((s) => [s.ticker, s.name])
  );

  if (!portfolio) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">실전 투자</h1>
        <div className="bg-gray-800/50 rounded-xl p-8 text-center text-gray-400">
          아직 실전 투자 데이터가 없습니다.
        </div>
      </div>
    );
  }

  const holdings = Object.entries(portfolio.holdings).map(([ticker, h]) => ({
    ticker,
    name: h.name || stockMap[ticker]?.name || ticker,
    shares: h.shares,
    avg_price: h.avg_price,
    sector: stockMap[ticker]?.sector || "-",
    acquired_date: h.acquired_date || null,
  }));

  // Follow 모드 데이터 (follow_investor_id + follow_start_date 존재 시)
  let follow: FollowInfo | null = null;
  const followId = config.follow.follow_investor_id;
  const followStart = config.follow.follow_start_date;
  if (followId && followStart) {
    const profile = await getProfile(followId);
    if (profile) {
      const today = new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Seoul",
      });
      const [investorSnapshots, todayAllocation] = await Promise.all([
        getInvestorSnapshots(followId, followStart),
        getAllocationByInvestorName(profile.name, today),
      ]);
      follow = {
        investorId: followId,
        investorName: profile.name,
        strategy: profile.strategy,
        startDate: followStart,
        todayAllocation,
        investorSnapshots,
      };
    }
  }

  return (
    <LivePortfolioView
      portfolio={portfolio}
      history={history}
      decisions={decisions}
      holdings={holdings}
      initialCapital={6_600_000}
      follow={follow}
      stockNameMap={stockNameMap}
      metaDiary={metaDiary}
    />
  );
}
