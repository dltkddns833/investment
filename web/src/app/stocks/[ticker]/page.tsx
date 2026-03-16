import {
  getConfig,
  getLatestReportDate,
  getDailyReport,
  getStockTransactions,
} from "@/lib/data";
import { krw } from "@/lib/format";
import RealStockChart from "@/components/RealStockChart";
import LiveStockPrice from "@/components/LiveStockPrice";
import LiveStockHolders from "@/components/LiveStockHolders";
import { SectorIcon } from "@/lib/sector-icons";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getEtfData, isEtfTicker } from "@/lib/etf-data";
import EtfDetail from "@/components/EtfDetail";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ ticker: string }>;
}

export default async function StockDetailPage({ params }: Props) {
  const { ticker } = await params;
  const decodedTicker = decodeURIComponent(ticker);

  const [config, latestDate, transactions] = await Promise.all([
    getConfig(),
    getLatestReportDate(),
    getStockTransactions(decodedTicker),
  ]);

  const stockInfo = config.stock_universe.find((s) => s.ticker === decodedTicker);
  if (!stockInfo) {
    return (
      <div>
        <p className="text-gray-400">종목을 찾을 수 없습니다.</p>
      </div>
    );
  }

  const report = latestDate ? (await getDailyReport(latestDate))! : null;
  const marketPrice = report?.market_prices[decodedTicker];
  const etfData = isEtfTicker(stockInfo.sector) ? getEtfData(decodedTicker) : null;

  // Find holders
  const holders: {
    name: string;
    investorId: string;
    shares: number;
    avg_price: number;
    value: number;
    profit: number;
    profit_pct: number;
  }[] = [];

  if (report) {
    for (const inv of config.investors) {
      const detail = report.investor_details[inv.name];
      if (!detail) continue;
      const holding = detail.holdings[decodedTicker];
      if (!holding) continue;
      holders.push({
        name: inv.name,
        investorId: inv.id,
        shares: holding.shares,
        avg_price: holding.avg_price,
        value: holding.value,
        profit: holding.profit,
        profit_pct: holding.profit_pct,
      });
    }
    holders.sort((a, b) => b.value - a.value);
  }

  // Map investor_id to name
  const investorNames = new Map(config.investors.map((inv) => [inv.id, inv.name]));

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Back + Header */}
      <Link
        href="/stocks"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-300 transition-colors -ml-1"
      >
        <ChevronLeft className="w-4 h-4" />
        종목 분석
      </Link>
      <div className="animate-in rounded-2xl bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-transparent p-4 md:p-6 lg:p-8 border border-white/5">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl md:text-3xl font-bold">{stockInfo.name}</h1>
          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
            <SectorIcon sector={stockInfo.sector} className="w-3 h-3" />
            {stockInfo.sector}
          </span>
        </div>
        <p className="text-gray-500 text-sm mt-1">{decodedTicker}</p>
        {(stockInfo.description || etfData?.objective) && (
          <p className="text-gray-400 text-sm mt-3 leading-relaxed">
            {stockInfo.description ?? etfData?.objective}
          </p>
        )}
        <LiveStockPrice
          ticker={decodedTicker}
          storedPrice={marketPrice?.price ?? 0}
          storedChangePct={marketPrice?.change_pct ?? 0}
        />
      </div>

      {/* Price Chart */}
      <section className="glass-card p-4 md:p-5 animate-in">
        <h2 className="text-lg font-bold mb-3 section-header">가격 추이</h2>
        <RealStockChart ticker={decodedTicker} />
      </section>

      {/* ETF 상세 정보 */}
      {etfData && (
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-4 section-header">ETF 구성 정보</h2>
          <EtfDetail etf={etfData} />
        </section>
      )}

      {/* Holders */}
      {holders.length > 0 && (
        <section className="glass-card overflow-hidden animate-in">
          <div className="py-4 px-4 border-b border-white/5">
            <h2 className="text-lg font-bold section-header">
              보유 투자자
              <span className="text-sm font-normal text-gray-400 ml-2">
                {holders.length}명
              </span>
            </h2>
          </div>
          <LiveStockHolders ticker={decodedTicker} holders={holders} />
        </section>
      )}

      {/* Transactions */}
      {transactions.length > 0 && (
        <section className="glass-card overflow-hidden animate-in">
          <div className="py-4 px-4 border-b border-white/5">
            <h2 className="text-lg font-bold section-header">
              거래내역
              <span className="text-sm font-normal text-gray-400 ml-2">
                {transactions.length}건
              </span>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-gray-500 text-xs">
                  <th className="text-left py-2.5 px-4">날짜</th>
                  <th className="text-left py-2.5 px-4">투자자</th>
                  <th className="text-center py-2.5 px-4">유형</th>
                  <th className="text-right py-2.5 px-4">수량</th>
                  <th className="text-right py-2.5 px-4">단가</th>
                  <th className="text-right py-2.5 px-4 hidden sm:table-cell">금액</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t, i) => (
                  <tr
                    key={i}
                    className="border-b border-white/5 hover:bg-white/[0.02]"
                  >
                    <td className="py-2.5 px-4 text-gray-400">{t.date}</td>
                    <td className="py-2.5 px-4">
                      {investorNames.get(t.investor_id) ?? t.investor_id}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          t.type === "buy"
                            ? "bg-red-500/10 text-red-400"
                            : "bg-blue-500/10 text-blue-400"
                        }`}
                      >
                        {t.type === "buy" ? "매수" : "매도"}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums">
                      {t.shares}주
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums">
                      {krw(t.price)}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-gray-400 hidden sm:table-cell">
                      {krw(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
