import {
  getConfig,
  getLatestReportDate,
  getDailyReport,
} from "@/lib/data";
import { signColor } from "@/lib/format";
import SectorHeatmap from "@/components/SectorHeatmap";
import SectorWeights from "@/components/SectorWeights";
import Link from "next/link";

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

  // Stock list sorted by change_pct
  const stockList = config.stock_universe
    .map((s) => ({
      ...s,
      price: report.market_prices[s.ticker]?.price ?? 0,
      change_pct: report.market_prices[s.ticker]?.change_pct ?? 0,
      holders: holderCount.get(s.ticker) ?? 0,
    }))
    .sort((a, b) => b.change_pct - a.change_pct);

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <div className="animate-in">
        <h1 className="text-2xl md:text-3xl font-bold">종목 분석</h1>
        <p className="text-gray-400 mt-1">섹터별 현황 & 종목 상세</p>
      </div>

      {/* Sector Heatmap */}
      <section className="glass-card p-4 md:p-5 animate-in">
        <h2 className="text-lg font-bold mb-4 section-header">섹터 히트맵</h2>
        <SectorHeatmap
          stocks={config.stock_universe}
          marketPrices={report.market_prices}
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

      {/* Stock List */}
      <section className="glass-card overflow-hidden animate-in">
        <div className="py-4 px-4 border-b border-white/5">
          <h2 className="text-lg font-bold section-header">
            전체 종목
            <span className="text-sm font-normal text-gray-400 ml-2">
              {stockList.length}종목
            </span>
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-gray-500 text-xs">
                <th className="text-left py-2.5 px-4">종목</th>
                <th className="text-left py-2.5 px-4 hidden sm:table-cell">섹터</th>
                <th className="text-right py-2.5 px-4">현재가</th>
                <th className="text-right py-2.5 px-4">등락률</th>
                <th className="text-right py-2.5 px-4 hidden sm:table-cell">보유</th>
              </tr>
            </thead>
            <tbody>
              {stockList.map((s) => (
                <tr
                  key={s.ticker}
                  className="border-b border-white/5 hover:bg-white/[0.02]"
                >
                  <td className="py-2.5 px-4">
                    <Link
                      href={`/stocks/${s.ticker}`}
                      className="font-medium hover:text-blue-400 transition-colors"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="py-2.5 px-4 text-gray-400 hidden sm:table-cell">
                    {s.sector}
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums">
                    {s.price.toLocaleString()}
                  </td>
                  <td
                    className={`py-2.5 px-4 text-right tabular-nums font-medium ${signColor(s.change_pct)}`}
                  >
                    {s.change_pct > 0 ? "+" : ""}
                    {s.change_pct.toFixed(2)}%
                  </td>
                  <td className="py-2.5 px-4 text-right text-gray-400 hidden sm:table-cell">
                    {s.holders > 0 ? `${s.holders}명` : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
