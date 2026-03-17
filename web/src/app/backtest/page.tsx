import { Suspense } from "react";
import Link from "next/link";
import {
  getBacktestRuns,
  getBacktestRun,
  getBacktestSnapshots,
  getConfig,
  PerformanceStats,
} from "@/lib/data";
import { krw, pct, signColor } from "@/lib/format";
import { getInvestorHex } from "@/lib/investor-colors";
import BacktestRunSelector from "@/components/BacktestRunSelector";
import BacktestAssetChart from "@/components/BacktestAssetChart";
import PerformanceStatsTable from "@/components/PerformanceStatsTable";
import InvestorRadarChart from "@/components/InvestorRadarChart";
import InvestorAvatar from "@/components/InvestorAvatar";
import TooltipIcon from "@/components/TooltipIcon";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ run?: string }>;
}

export default async function BacktestPage({ searchParams }: Props) {
  const params = await searchParams;
  const [runs, config] = await Promise.all([getBacktestRuns(), getConfig()]);

  if (runs.length === 0) {
    return (
      <div className="space-y-6 md:space-y-8">
        <div className="animate-in">
          <h1 className="text-2xl md:text-3xl font-bold">백테스트</h1>
          <p className="text-gray-400 text-sm mt-1">
            아직 백테스트 결과가 없습니다.
          </p>
          <p className="text-gray-500 text-xs mt-2">
            <code className="bg-gray-800 px-2 py-0.5 rounded">
              python3 scripts/core/run_backtest.py --start 2025-03-01 --end
              2026-03-01
            </code>
          </p>
        </div>
      </div>
    );
  }

  const currentRunId = params.run ?? runs[0].id;
  const currentRun = await getBacktestRun(currentRunId);
  if (!currentRun) {
    return <div className="text-gray-400">백테스트를 찾을 수 없습니다.</div>;
  }

  const snapshots = await getBacktestSnapshots(currentRunId);
  const rankings = currentRun.summary.rankings;
  const initialCapital = currentRun.parameters.initial_capital;

  // 투자자 이름 매핑
  const investorNameMap: Record<string, string> = {};
  const investorIdMap: Record<string, string> = {};
  for (const inv of config.investors) {
    investorNameMap[inv.id] = inv.name;
    investorIdMap[inv.name] = inv.id;
  }

  // PerformanceStats 형태로 변환 (기존 컴포넌트 재사용)
  const benchmarkReturn =
    rankings.find((r) => r.investor_id === "E")?.cumulative_return_pct ?? 0;

  const perfStats: PerformanceStats[] = rankings.map((r) => ({
    investor: r.name,
    investorId: r.investor_id,
    sharpeRatio: r.sharpe_ratio,
    mdd: r.mdd_pct,
    volatility: r.volatility_pct,
    alpha: r.cumulative_return_pct - benchmarkReturn,
    winRate: r.win_rate_pct,
    totalReturnPct: r.cumulative_return_pct,
    tradingDays: r.trading_days,
  }));

  // 상위/하위 3명
  const sortedRankings = [...rankings].sort(
    (a, b) => b.cumulative_return_pct - a.cumulative_return_pct
  );

  return (
    <div className="space-y-6 md:space-y-8">
      {/* 헤더 */}
      <div className="animate-in flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">백테스트</h1>
          <p className="text-gray-400 text-sm mt-1">
            {currentRun.start_date} ~ {currentRun.end_date} &middot;{" "}
            {currentRun.trading_days}영업일 &middot;{" "}
            {currentRun.investors.length}명
          </p>
        </div>
        <Suspense>
          <BacktestRunSelector runs={runs} currentRunId={currentRunId} />
        </Suspense>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-in">
        <SummaryCard
          label="최고 수익"
          investorId={sortedRankings[0].investor_id}
          investorName={sortedRankings[0].name}
          value={pct(sortedRankings[0].cumulative_return_pct, true)}
          color={signColor(sortedRankings[0].cumulative_return_pct)}
        />
        <SummaryCard
          label="최저 수익"
          investorId={sortedRankings[sortedRankings.length - 1].investor_id}
          investorName={sortedRankings[sortedRankings.length - 1].name}
          value={pct(
            sortedRankings[sortedRankings.length - 1].cumulative_return_pct,
            true
          )}
          color={signColor(
            sortedRankings[sortedRankings.length - 1].cumulative_return_pct
          )}
        />
        <SummaryCard
          label="최고 샤프"
          investorId={
            [...rankings].sort((a, b) => b.sharpe_ratio - a.sharpe_ratio)[0]
              .investor_id
          }
          investorName={
            [...rankings].sort((a, b) => b.sharpe_ratio - a.sharpe_ratio)[0]
              .name
          }
          value={
            [...rankings]
              .sort((a, b) => b.sharpe_ratio - a.sharpe_ratio)[0]
              .sharpe_ratio.toFixed(2)
          }
          color="text-emerald-400"
        />
        <SummaryCard
          label="최저 MDD"
          investorId={
            [...rankings].sort((a, b) => a.mdd_pct - b.mdd_pct)[0].investor_id
          }
          investorName={
            [...rankings].sort((a, b) => a.mdd_pct - b.mdd_pct)[0].name
          }
          value={pct(
            [...rankings].sort((a, b) => a.mdd_pct - b.mdd_pct)[0].mdd_pct
          )}
          color="text-blue-400"
        />
      </div>

      {/* 자산 추이 차트 */}
      <section className="glass-card p-4 md:p-5 animate-in">
        <h2 className="text-lg font-bold mb-1 section-header">자산 추이</h2>
        <p className="text-xs text-gray-500 mb-4">
          {currentRun.start_date} ~ {currentRun.end_date} 기간 투자자별 총자산
          변화
        </p>
        <BacktestAssetChart
          snapshots={snapshots}
          investorIds={currentRun.investors}
          investorNames={investorNameMap}
          initialCapital={initialCapital}
        />
      </section>

      {/* 순위 테이블 */}
      <section className="glass-card p-4 md:p-5 animate-in">
        <h2 className="text-lg font-bold mb-1 section-header">성과 순위</h2>
        <p className="text-xs text-gray-500 mb-4">
          수익률 기준 정렬 &middot; 벤치마크(E){" "}
          {pct(benchmarkReturn, true)}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase">
                  순위
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase">
                  투자자
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-400 uppercase">
                  수익률
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-400 uppercase">
                  총자산
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-400 uppercase hidden md:table-cell">
                  <span className="inline-flex items-center justify-end gap-1">
                    샤프
                    <TooltipIcon text="위험 대비 수익 효율. 높을수록 같은 리스크에서 더 많은 수익을 냈다는 의미." />
                  </span>
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-400 uppercase hidden md:table-cell">
                  <span className="inline-flex items-center justify-end gap-1">
                    MDD
                    <TooltipIcon text="최대 낙폭(Max Drawdown). 고점 대비 최대 하락폭으로, 최악의 손실 구간을 나타냄." />
                  </span>
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-400 uppercase hidden md:table-cell">
                  <span className="inline-flex items-center justify-end gap-1">
                    변동성
                    <TooltipIcon text="수익률의 변동 정도(연환산). 낮을수록 안정적인 투자 성과를 의미." />
                  </span>
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-400 uppercase hidden lg:table-cell">
                  <span className="inline-flex items-center justify-end gap-1">
                    승률
                    <TooltipIcon text="매도 거래 중 수익을 낸 비율. 높을수록 수익 실현 빈도가 높다는 의미." />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sortedRankings.map((r, idx) => (
                <tr
                  key={r.investor_id}
                  className="hover:bg-white/5 transition-colors"
                >
                  <td className="px-3 py-2.5 font-mono text-gray-400">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/investors/${r.investor_id}`}
                      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                    >
                      <InvestorAvatar investorId={r.investor_id} size="sm" />
                      <div>
                        <span className="font-medium hover:underline">{r.name}</span>
                        <span className="text-xs text-gray-500 ml-1.5 hidden sm:inline">
                          {r.strategy}
                        </span>
                      </div>
                    </Link>
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono font-medium ${signColor(r.cumulative_return_pct)}`}
                  >
                    {pct(r.cumulative_return_pct, true)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-300">
                    {krw(r.final_asset)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono hidden md:table-cell ${signColor(r.sharpe_ratio)}`}
                  >
                    {r.sharpe_ratio.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-blue-400 hidden md:table-cell">
                    {pct(r.mdd_pct)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-300 hidden md:table-cell">
                    {r.volatility_pct.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-300 hidden lg:table-cell">
                    {r.win_rate_pct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 레이더 차트 */}
      <section className="glass-card p-4 md:p-5 animate-in">
        <h2 className="text-lg font-bold mb-1 section-header">성과 비교</h2>
        <p className="text-xs text-gray-500 mb-4">
          5축 레이더 차트 &middot; 샤프비율 상위 5명 기본 표시
        </p>
        <InvestorRadarChart stats={perfStats} investorIds={investorIdMap} />
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  investorId,
  investorName,
  value,
  color,
}: {
  label: string;
  investorId: string;
  investorName: string;
  value: string;
  color: string;
}) {
  return (
    <div className="glass-card p-3 md:p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <Link
        href={`/investors/${investorId}`}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <InvestorAvatar investorId={investorId} size="sm" />
        <div>
          <p className="text-sm font-medium hover:underline">{investorName}</p>
          <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
        </div>
      </Link>
    </div>
  );
}
