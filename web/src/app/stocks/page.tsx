import {
  getConfig,
  getLatestReportDate,
  getDailyReport,
} from "@/lib/data";
import LiveSectorHeatmap from "@/components/LiveSectorHeatmap";
import LiveStockList from "@/components/LiveStockList";
import SectorWeights from "@/components/SectorWeights";

export const dynamic = "force-dynamic";

export default async function StocksPage() {
  const [config, latestDate] = await Promise.all([
    getConfig(),
    getLatestReportDate(),
  ]);

  if (!latestDate) {
    return (
      <div>
        <h1 className="text-2xl md:text-3xl font-bold mb-4">종목 분석</h1>
        <p className="text-gray-400">아직 리포트가 없습니다.</p>
      </div>
    );
  }

  const report = (await getDailyReport(latestDate))!;

  // Count holders per stock
  const holderCount = new Map<string, number>();
  for (const detail of Object.values(report.investor_details)) {
    for (const ticker of Object.keys(detail.holdings)) {
      holderCount.set(ticker, (holderCount.get(ticker) ?? 0) + 1);
    }
  }

  const isEtf = (sector: string) => sector.endsWith("ETF");

  const allRows = config.stock_universe.map((s) => ({
    ...s,
    price: report.market_prices[s.ticker]?.price ?? 0,
    change_pct: report.market_prices[s.ticker]?.change_pct ?? 0,
    holders: holderCount.get(s.ticker) ?? 0,
  }));

  const stockList = allRows.filter((s) => !isEtf(s.sector));
  const etfList = allRows.filter((s) => isEtf(s.sector));
  const regularUniverse = config.stock_universe.filter((s) => !isEtf(s.sector));

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <div className="animate-in">
        <h1 className="text-2xl md:text-3xl font-bold">종목 분석</h1>
        <p className="text-gray-400 mt-1">섹터별 현황 & 종목 상세</p>
      </div>

      {/* Sector Heatmap — 일반 주식만 */}
      <section className="glass-card p-4 md:p-5 animate-in">
        <h2 className="text-lg font-bold mb-4 section-header">섹터 히트맵</h2>
        <LiveSectorHeatmap
          stocks={regularUniverse}
          storedPrices={report.market_prices}
        />
      </section>

      {/* Sector Weights */}
      <section className="glass-card p-4 md:p-5 animate-in">
        <h2 className="text-lg font-bold mb-4 section-header">
          투자자별 섹터 비중
        </h2>
        <SectorWeights
          investorDetails={report.investor_details}
          stocks={config.stock_universe}
        />
      </section>

      {/* 국내 주식 목록 */}
      <section className="glass-card overflow-hidden animate-in">
        <LiveStockList stocks={stockList} title="국내 주식" count={stockList.length} />
      </section>

      {/* ETF 목록 */}
      <section className="glass-card overflow-hidden animate-in">
        <LiveStockList stocks={etfList} title="ETF" count={etfList.length} />
      </section>
    </div>
  );
}
