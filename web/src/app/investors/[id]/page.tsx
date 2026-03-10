import {
  getProfile,
  getPortfolio,
  getLatestReportDate,
  getDailyReport,
  getAllocation,
} from "@/lib/data";
import { krw, pct, signColor } from "@/lib/format";
import HoldingsTable from "@/components/HoldingsTable";
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
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{profile.name}</h1>
        <p className="text-gray-400">{profile.strategy}</p>
        <p className="text-gray-500 text-sm mt-1">{profile.description}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <div className="text-gray-400 text-xs">총 자산</div>
          <div className="text-lg font-bold mt-1">
            {detail ? krw(detail.total_asset) : krw(portfolio.initial_capital)}
          </div>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <div className="text-gray-400 text-xs">수익률</div>
          <div
            className={`text-lg font-bold mt-1 ${detail ? signColor(detail.total_return_pct) : "text-gray-500"}`}
          >
            {detail ? pct(detail.total_return_pct) : "0.00%"}
          </div>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <div className="text-gray-400 text-xs">현금</div>
          <div className="text-lg font-bold mt-1">{krw(portfolio.cash)}</div>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <div className="text-gray-400 text-xs">리밸런싱</div>
          <div className="text-lg font-bold mt-1">
            {profile.rebalance_frequency_days}일마다
          </div>
          <div className="text-xs text-gray-500">
            총 {portfolio.rebalance_history.length}회
          </div>
        </div>
      </div>

      {/* Profile Info */}
      <section className="bg-gray-800/30 rounded-xl border border-gray-700 p-5">
        <h2 className="text-lg font-bold mb-3">분석 기준</h2>
        <div className="flex flex-wrap gap-2">
          {profile.analysis_criteria.map((c, i) => (
            <span
              key={i}
              className="bg-gray-700/50 text-gray-300 text-xs px-3 py-1 rounded-full"
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
            <section className="bg-gray-800/30 rounded-xl border border-gray-700 p-5">
              <h2 className="text-lg font-bold mb-3">포트폴리오 구성</h2>
              <PortfolioChart detail={detail} />
            </section>

            {allocation && (
              <section className="bg-gray-800/30 rounded-xl border border-gray-700 p-5">
                <h2 className="text-lg font-bold mb-3">목표 배분</h2>
                <p className="text-xs text-gray-400 mb-3">
                  {allocation.rationale}
                </p>
                <div className="space-y-2">
                  {Object.entries(allocation.allocation).map(
                    ([ticker, ratio]) => (
                      <div key={ticker} className="flex items-center gap-2">
                        <div className="flex-1 text-sm">{ticker}</div>
                        <div className="w-32 bg-gray-700 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${ratio * 100}%` }}
                          />
                        </div>
                        <div className="text-sm text-gray-400 w-12 text-right">
                          {(ratio * 100).toFixed(0)}%
                        </div>
                      </div>
                    )
                  )}
                </div>
              </section>
            )}
          </div>

          <section className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden">
            <div className="p-5 border-b border-gray-700">
              <h2 className="text-lg font-bold">보유 종목</h2>
            </div>
            <HoldingsTable holdings={detail.holdings} />
          </section>
        </>
      )}

      {/* Transaction History */}
      {portfolio.transactions.length > 0 && (
        <section className="bg-gray-800/30 rounded-xl border border-gray-700 overflow-hidden">
          <div className="p-5 border-b border-gray-700">
            <h2 className="text-lg font-bold">거래 내역</h2>
            <span className="text-gray-400 text-sm ml-2">
              {portfolio.transactions.length}건
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="py-2 px-3 text-left">날짜</th>
                  <th className="py-2 px-3 text-center">유형</th>
                  <th className="py-2 px-3 text-left">종목</th>
                  <th className="py-2 px-3 text-right">수량</th>
                  <th className="py-2 px-3 text-right">단가</th>
                  <th className="py-2 px-3 text-right">금액</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.transactions
                  .slice()
                  .reverse()
                  .map((t, i) => (
                    <tr
                      key={i}
                      className="border-b border-gray-800/50 hover:bg-gray-800/30"
                    >
                      <td className="py-2 px-3 text-gray-400">{t.date}</td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded ${
                            t.type === "buy"
                              ? "bg-red-900/30 text-red-400"
                              : "bg-blue-900/30 text-blue-400"
                          }`}
                        >
                          {t.type === "buy" ? "매수" : "매도"}
                        </span>
                      </td>
                      <td className="py-2 px-3">{t.name}</td>
                      <td className="py-2 px-3 text-right font-mono">
                        {t.shares}주
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {krw(t.price)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
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
