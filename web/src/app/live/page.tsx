import {
  getRealPortfolioHistory,
  getLatestRealPortfolio,
  getMetaDecisions,
  getConfig,
} from "@/lib/data";
import { krw, pct, signColor } from "@/lib/format";
import LiveAssetChart from "@/components/LiveAssetChart";
import LiveHoldingsTable from "@/components/LiveHoldingsTable";
import LiveDecisionHistory from "@/components/LiveDecisionHistory";

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

  const holdingsEntries = Object.entries(portfolio.holdings).map(
    ([ticker, h]) => ({
      ticker,
      name: h.name || stockMap[ticker]?.name || ticker,
      shares: h.shares,
      avg_price: h.avg_price,
      sector: stockMap[ticker]?.sector || "-",
    })
  );

  const initialCapital = 2_000_000;
  const totalReturn = portfolio.cumulative_return_pct ?? 0;
  const dailyReturn = portfolio.daily_return_pct ?? 0;
  const kospiReturn = portfolio.kospi_cumulative_pct;
  const alpha = portfolio.alpha_cumulative_pct;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">실전 투자</h1>
        <span className="text-sm text-gray-400">
          {portfolio.date} 기준
        </span>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="총자산"
          value={krw(portfolio.total_asset)}
          sub={pct(totalReturn)}
          subColor={signColor(totalReturn)}
        />
        <SummaryCard
          label="일일 수익률"
          value={pct(dailyReturn)}
          valueColor={signColor(dailyReturn)}
        />
        <SummaryCard
          label="KOSPI 누적"
          value={kospiReturn != null ? pct(kospiReturn) : "-"}
          valueColor={kospiReturn != null ? signColor(kospiReturn) : "text-gray-500"}
        />
        <SummaryCard
          label="Alpha"
          value={alpha != null ? pct(alpha) : "-"}
          valueColor={alpha != null ? signColor(alpha) : "text-gray-500"}
          highlight
        />
      </div>

      {/* 자산 + 현금 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-gray-800/50 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-400 mb-4">
            자산 추이
          </h2>
          <LiveAssetChart
            history={history}
            initialCapital={initialCapital}
          />
        </div>
        <div className="bg-gray-800/50 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-400">포트폴리오 현황</h2>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">초기 자금</span>
              <span>{krw(initialCapital)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">현재 자산</span>
              <span className="font-semibold">{krw(portfolio.total_asset)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">현금</span>
              <span>{krw(portfolio.cash)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">현금 비율</span>
              <span>
                {((portfolio.cash / portfolio.total_asset) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="border-t border-white/10 pt-3 flex justify-between text-sm">
              <span className="text-gray-400">손익</span>
              <span className={`font-semibold ${signColor(portfolio.total_asset - initialCapital)}`}>
                {portfolio.total_asset - initialCapital >= 0 ? "+" : ""}
                {krw(portfolio.total_asset - initialCapital)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 보유종목 */}
      <div className="bg-gray-800/50 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 mb-4">보유종목</h2>
        <LiveHoldingsTable holdings={holdingsEntries} />
      </div>

      {/* 의사결정 히스토리 */}
      <div className="bg-gray-800/50 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 mb-4">
          매매 히스토리
        </h2>
        <LiveDecisionHistory decisions={decisions} />
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  valueColor,
  subColor,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
  subColor?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 ${
        highlight
          ? "bg-gradient-to-br from-blue-900/40 to-purple-900/40 border border-blue-500/20"
          : "bg-gray-800/50"
      }`}
    >
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-bold ${valueColor || ""}`}>{value}</p>
      {sub && (
        <p className={`text-xs mt-0.5 ${subColor || "text-gray-500"}`}>
          {sub}
        </p>
      )}
    </div>
  );
}
