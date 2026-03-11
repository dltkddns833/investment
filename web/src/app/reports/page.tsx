import {
  getConfig,
  getDailyReturns,
  getPeriodSummary,
  getLatestReportDate,
} from "@/lib/data";
import { krw, pct, signColor } from "@/lib/format";
import CalendarHeatmap from "@/components/CalendarHeatmap";
import PeriodSelector from "@/components/PeriodSelector";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ investor?: string; month?: string }>;
}

export default async function ReportsPage({ searchParams }: Props) {
  const params = await searchParams;
  const [config, latestDate] = await Promise.all([
    getConfig(),
    getLatestReportDate(),
  ]);

  if (!latestDate) {
    return (
      <div>
        <h1 className="text-2xl md:text-3xl font-bold mb-4">리포트</h1>
        <p className="text-gray-400">아직 리포트가 없습니다.</p>
      </div>
    );
  }

  // Parse month param or use latest report date
  let year: number, month: number;
  if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
    const [y, m] = params.month.split("-").map(Number);
    year = y;
    month = m;
  } else {
    const d = new Date(latestDate);
    year = d.getFullYear();
    month = d.getMonth() + 1;
  }

  const investorId = params.investor ?? null;
  const investorName = investorId
    ? config.investors.find((inv) => inv.id === investorId)?.name ?? null
    : null;

  // Month date range for period summary
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = new Date(year, month, 0).toISOString().slice(0, 10);

  const [dailyReturns, periodSummary] = await Promise.all([
    getDailyReturns(investorName, year, month),
    getPeriodSummary(monthStart, monthEnd),
  ]);

  const investors = config.investors.map((inv) => ({
    id: inv.id,
    name: inv.name,
  }));

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <div className="animate-in">
        <h1 className="text-2xl md:text-3xl font-bold">리포트</h1>
        <p className="text-gray-400 mt-1">주간/월간 성과 분석</p>
      </div>

      {/* Period Selector */}
      <PeriodSelector
        investors={investors}
        currentInvestor={investorId}
        year={year}
        month={month}
      />

      {/* Desktop: inline / Mobile: stacked */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Calendar Heatmap */}
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-3 section-header">
            수익률 달력
            {investorName && (
              <span className="text-sm font-normal text-gray-400 ml-2">
                {investorName}
              </span>
            )}
          </h2>
          {dailyReturns.length > 0 ? (
            <CalendarHeatmap data={dailyReturns} year={year} month={month} />
          ) : (
            <p className="text-gray-500 text-sm py-8 text-center">
              해당 월의 리포트가 없습니다.
            </p>
          )}
        </section>

        {/* Period Summary */}
        {periodSummary.length > 0 && (
          <section className="glass-card p-4 md:p-5 animate-in">
            <h2 className="text-lg font-bold mb-4 section-header">
              투자자별 월간 수익률
            </h2>

            {/* Bar chart */}
            <div className="space-y-3 mb-6">
              {periodSummary.map((s) => {
                const maxAbs = Math.max(
                  ...periodSummary.map((p) => Math.abs(p.period_return_pct)),
                  0.1
                );
                const width = Math.abs(s.period_return_pct) / maxAbs;
                const isPositive = s.period_return_pct >= 0;

                return (
                  <div key={s.investor} className="flex items-center gap-3">
                    <div className="w-16 text-sm truncate shrink-0">
                      {s.investor}
                    </div>
                    <div className="flex-1 flex items-center">
                      <div className="w-full bg-gray-700/30 rounded-full h-5 relative overflow-hidden">
                        <div
                          className={`h-5 rounded-full transition-all ${
                            isPositive ? "bg-red-500/60" : "bg-blue-500/60"
                          }`}
                          style={{ width: `${Math.max(width * 100, 2)}%` }}
                        />
                      </div>
                    </div>
                    <div
                      className={`text-sm w-16 text-right tabular-nums font-medium ${signColor(s.period_return_pct)}`}
                    >
                      {s.period_return_pct > 0 ? "+" : ""}
                      {s.period_return_pct.toFixed(2)}%
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-gray-500 text-xs">
                    <th className="text-left py-2 px-2">#</th>
                    <th className="text-left py-2 px-2">투자자</th>
                    <th className="text-right py-2 px-2">월간</th>
                    <th className="text-right py-2 px-2">누적</th>
                    <th className="text-right py-2 px-2 hidden xl:table-cell">총자산</th>
                  </tr>
                </thead>
                <tbody>
                  {periodSummary.map((s, i) => (
                    <tr
                      key={s.investor}
                      className="border-b border-white/5 hover:bg-white/[0.02]"
                    >
                      <td className="py-2.5 px-2 text-gray-500">{i + 1}</td>
                      <td className="py-2.5 px-2 font-medium">{s.investor}</td>
                      <td
                        className={`py-2.5 px-2 text-right tabular-nums font-medium ${signColor(s.period_return_pct)}`}
                      >
                        {s.period_return_pct > 0 ? "+" : ""}
                        {s.period_return_pct.toFixed(2)}%
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right tabular-nums ${signColor(s.total_return_pct)}`}
                      >
                        {s.total_return_pct > 0 ? "+" : ""}
                        {s.total_return_pct.toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-gray-400 hidden xl:table-cell">
                        {krw(s.total_asset)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
