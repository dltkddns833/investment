import {
  getConfig,
  getLatestReportDate,
  getDailyReport,
  getReturnCorrelationMatrix,
  getPositionOverlaps,
  getStockPopularity,
  getPerformanceStats,
  computeAllAttributions,
} from "@/lib/data";
import CorrelationHeatmap from "@/components/CorrelationHeatmap";
import OverlapMatrix from "@/components/OverlapMatrix";
import StockPopularityChart from "@/components/StockPopularityChart";
import PerformanceStatsTable from "@/components/PerformanceStatsTable";
import InvestorRadarChart from "@/components/InvestorRadarChart";
import AttributionComparisonChart from "@/components/AttributionComparisonChart";

export const dynamic = "force-dynamic";

export default async function AnalysisPage() {
  const [config, latestDate] = await Promise.all([
    getConfig(),
    getLatestReportDate(),
  ]);

  if (!latestDate) {
    return (
      <div>
        <h1 className="text-2xl md:text-3xl font-bold mb-4">투자자 분석</h1>
        <p className="text-gray-400">아직 리포트가 없습니다.</p>
      </div>
    );
  }

  const investorNames = config.investors.map((inv) => inv.name);
  const investorIdList = config.investors.map((inv) => inv.id);

  // name → id 맵
  const investorIds: Record<string, string> = {};
  for (const inv of config.investors) investorIds[inv.name] = inv.id;

  const [report, correlations, perfStats] = await Promise.all([
    getDailyReport(latestDate).then((r) => r!),
    getReturnCorrelationMatrix(investorNames),
    getPerformanceStats(investorNames, investorIdList),
  ]);

  const overlaps = getPositionOverlaps(report.investor_details);
  const popularity = getStockPopularity(report.investor_details, config.stock_universe);
  const allAttributions = computeAllAttributions(report.investor_details, investorIds, config.stock_universe);

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="animate-in">
        <h1 className="text-2xl md:text-3xl font-bold">투자자 분석</h1>
        <p className="text-gray-400 text-sm mt-1">상관관계 & 포지션 비교 · {latestDate} 기준</p>
      </div>

      {/* Performance Stats */}
      <section className="glass-card p-4 md:p-5 animate-in">
        <h2 className="text-lg font-bold mb-1 section-header">성과 지표</h2>
        <p className="text-xs text-gray-500 mb-4">
          샤프비율, 최대낙폭(MDD), 변동성, 알파(정기준 대비), 승률 비교. 컬럼 클릭 시 정렬.
        </p>
        {perfStats.some((s) => s.sharpeRatio !== null) && (
          <InvestorRadarChart stats={perfStats} investorIds={investorIds} />
        )}
        <div className="mt-4">
          <PerformanceStatsTable stats={perfStats} investorIds={investorIds} />
        </div>
      </section>

      {/* Correlation Matrix */}
      <section className="glass-card p-4 md:p-5 animate-in">
        <h2 className="text-lg font-bold mb-1 section-header">수익률 상관관계</h2>
        <p className="text-xs text-gray-500 mb-4">
          투자자 간 일별 수익률의 Pearson 상관계수. 빨강일수록 같이 움직이고, 파랑일수록 반대로 움직입니다.
        </p>
        {correlations.length > 0 ? (
          <CorrelationHeatmap investorNames={investorNames} correlations={correlations} />
        ) : (
          <p className="text-gray-500 text-sm">데이터가 3일 이상 필요합니다.</p>
        )}
      </section>

      {/* Position Overlap */}
      <section className="glass-card p-4 md:p-5 animate-in">
        <h2 className="text-lg font-bold mb-1 section-header">포지션 겹침률</h2>
        <p className="text-xs text-gray-500 mb-4">
          보유 종목의 Jaccard 유사도. 셀을 클릭하면 공통/독자 종목을 확인할 수 있습니다.
        </p>
        <OverlapMatrix investorNames={investorNames} overlaps={overlaps} stockNames={Object.fromEntries(config.stock_universe.map((s) => [s.ticker, s.name]))} />
      </section>

      {/* Stock Popularity */}
      <section className="glass-card p-4 md:p-5 animate-in">
        <h2 className="text-lg font-bold mb-1 section-header">종목 인기도</h2>
        <p className="text-xs text-gray-500 mb-4">
          각 종목을 보유 중인 투자자 수. 많은 투자자가 보유할수록 컨센서스가 높습니다.
        </p>
        <StockPopularityChart data={popularity} totalInvestors={investorNames.length} />
      </section>

      {/* Attribution Comparison */}
      <section className="glass-card p-4 md:p-5 animate-in">
        <h2 className="text-lg font-bold mb-1 section-header">성과 기여도 분석</h2>
        <p className="text-xs text-gray-500 mb-4">
          투자자별 섹터 기여도 비교. 같은 섹터에서 누가 더 많은 수익을 올렸는지 확인할 수 있습니다.
        </p>
        <AttributionComparisonChart attributions={allAttributions} />
      </section>
    </div>
  );
}
