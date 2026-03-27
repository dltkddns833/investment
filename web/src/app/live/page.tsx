import {
  getRealPortfolioHistory,
  getLatestRealPortfolio,
  getMetaDecisions,
  getConfig,
} from "@/lib/data";
import LivePortfolioView from "@/components/LivePortfolioView";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const [portfolio, history, decisions, config] = await Promise.all([
    getLatestRealPortfolio(),
    getRealPortfolioHistory(),
    getMetaDecisions(),
    getConfig(),
  ]);

  const stockMap = Object.fromEntries(
    config.stock_universe.map((s) => [s.ticker, s])
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

  return (
    <LivePortfolioView
      portfolio={portfolio}
      history={history}
      decisions={decisions}
      holdings={holdings}
      initialCapital={2_000_000}
    />
  );
}
