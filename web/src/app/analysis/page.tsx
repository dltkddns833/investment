import {
  getConfig,
  getLatestReportDate,
  getDailyReport,
  getReturnCorrelationMatrix,
  getPositionOverlaps,
  getStockPopularity,
  getPerformanceStats,
  computeAllAttributions,
  getMarketRegimes,
  getAllAssetHistory,
  getTransactionSummary,
  getBacktestRuns,
} from "@/lib/data";
import CorrelationHeatmap from "@/components/CorrelationHeatmap";
import OverlapMatrix from "@/components/OverlapMatrix";
import StockPopularityChart from "@/components/StockPopularityChart";
import PerformanceStatsTable from "@/components/PerformanceStatsTable";
import InvestorRadarChart from "@/components/InvestorRadarChart";
import AttributionComparisonChart from "@/components/AttributionComparisonChart";
import RegimeTimeline from "@/components/RegimeTimeline";
import RegimePerformanceChart from "@/components/RegimePerformanceChart";
import RegimePerformanceTable from "@/components/RegimePerformanceTable";
import OptimalCombinationPanel from "@/components/OptimalCombinationPanel";
import ScorecardTable from "@/components/ScorecardTable";
import ScorecardRadarChart from "@/components/ScorecardRadarChart";
import BacktestDivergenceChart from "@/components/BacktestDivergenceChart";
import {
  computeRegimeSegments,
  computeRegimePerformance,
  computeOptimalCombination,
} from "@/lib/regime-analysis";
import { computeScorecards } from "@/lib/scorecard";

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

  const [report, correlations, perfStats, regimes, assetHistory, txnSummary, backtestRuns] = await Promise.all([
    getDailyReport(latestDate).then((r) => r!),
    getReturnCorrelationMatrix(investorNames),
    getPerformanceStats(investorNames, investorIdList),
    getMarketRegimes(),
    getAllAssetHistory(investorNames),
    getTransactionSummary(investorIdList),
    getBacktestRuns(),
  ]);

  const overlaps = getPositionOverlaps(report.investor_details);
  const popularity = getStockPopularity(report.investor_details, config.stock_universe);
  const allAttributions = computeAllAttributions(report.investor_details, investorIds, config.stock_universe);

  // 스코어카드 계산
  const scorecards = computeScorecards(
    perfStats, assetHistory, txnSummary, backtestRuns,
    investorIds, config.simulation.initial_capital
  );
  const hasBacktestData = backtestRuns.length > 0;

  // 국면별 성과 분석
  const regimeSegments = computeRegimeSegments(regimes);
  const regimePerformances = computeRegimePerformance(regimes, assetHistory, investorNames, investorIds);
  const optimalCombination = computeOptimalCombination(regimePerformances);

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="animate-in">
        <h1 className="text-2xl md:text-3xl font-bold">투자자 분석</h1>
        <p className="text-gray-400 text-sm mt-1">상관관계 & 포지션 비교 · {latestDate} 기준</p>
      </div>

      {/* Strategy Scorecard */}
      {scorecards.length > 0 && (
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-1 section-header">전략 스코어카드</h2>
          <p className="text-xs text-gray-500 mb-4">
            6개 카테고리별 0~100점 종합 평가. 상위 3개 전략에 실전 추천 뱃지 부여.
          </p>
          <ScorecardRadarChart scorecards={scorecards} />
          <div className="mt-4">
            <ScorecardTable scorecards={scorecards} />
          </div>
          {hasBacktestData && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-300 mb-2">백테스트 vs 라이브 괴리율</h3>
              <BacktestDivergenceChart scorecards={scorecards} />
            </div>
          )}
        </section>
      )}

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

      {/* Market Regime Performance */}
      {regimes.length > 0 && (
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-1 section-header">국면별 성과</h2>
          <p className="text-xs text-gray-500 mb-4">
            KOSPI 레짐(강세/중립/약세)별 투자자 수익률 비교. 각 전략이 어떤 시장 환경에서 강한지 분석합니다.
          </p>

          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-300 mb-2">시장 국면 타임라인</h3>
            <RegimeTimeline segments={regimeSegments} regimes={regimes} />
            <p className="text-[11px] text-gray-600 mt-2">
              KODEX 200(KOSPI 대용) 가격 흐름 위에 이동평균·거래량·변동성 기반으로 판단한 시장 국면을 표시합니다.
              초록 구간은 강세(bull score ≥ 2), 빨강은 약세(≤ -2), 회색은 중립입니다.
            </p>
          </div>

          {regimePerformances.length > 0 && (
            <>
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-300 mb-2">국면별 수익률 비교</h3>
                <RegimePerformanceChart performances={regimePerformances} />
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-300 mb-2">국면별 수익률 테이블</h3>
                <RegimePerformanceTable performances={regimePerformances} />
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-2">최적 투자자 조합</h3>
                <OptimalCombinationPanel combination={optimalCombination} investorIds={investorIds} />
              </div>
            </>
          )}
        </section>
      )}

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
