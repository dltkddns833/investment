import type { PerformanceStats, AllAssetSnapshot, BacktestRun } from "./data";

// --- Types ---

export interface CategoryScore {
  score: number; // 0-100
  rank: number; // 1-14
  details: Record<string, number>; // raw metric values
}

export interface InvestorScorecard {
  investor: string;
  investorId: string;
  totalScore: number;
  rank: number;
  recommended: boolean; // top 3
  categories: {
    profitability: CategoryScore;
    riskAdjusted: CategoryScore;
    defense: CategoryScore;
    consistency: CategoryScore;
    efficiency: CategoryScore;
    validation: CategoryScore;
  };
}

export interface TransactionSummary {
  totalBuyAmount: number;
  totalSellAmount: number;
  totalFees: number;
  sellCount: number;
}

// --- Helpers ---

/** Min-max normalize to 0-100. higherBetter=false inverts the scale. */
function minMaxNormalize(
  values: number[],
  higherBetter: boolean
): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return values.map(() => 50);
  return values.map((v) => {
    const normalized = ((v - min) / range) * 100;
    return higherBetter ? normalized : 100 - normalized;
  });
}

/** Assign ranks (1 = highest score) with ties sharing the same rank. */
function assignRanks(scores: number[]): number[] {
  const indexed = scores.map((s, i) => ({ score: s, index: i }));
  indexed.sort((a, b) => b.score - a.score);
  const ranks = new Array<number>(scores.length);
  for (let i = 0; i < indexed.length; i++) {
    ranks[indexed[i].index] = i + 1;
  }
  return ranks;
}

/** Compute Sortino ratio from daily returns. */
function computeSortino(
  dailyReturns: number[],
  riskFreeRate: number = 0.035
): number {
  if (dailyReturns.length < 4) return 0;
  const dailyRf = riskFreeRate / 252;
  const excessReturns = dailyReturns.map((r) => r - dailyRf);
  const mean = excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length;
  const downsideReturns = excessReturns.filter((r) => r < 0);
  if (downsideReturns.length === 0) return mean > 0 ? 3 : 0; // cap at 3 if no downside
  const downsideVariance =
    downsideReturns.reduce((a, b) => a + b * b, 0) / downsideReturns.length;
  const downsideStd = Math.sqrt(downsideVariance);
  if (downsideStd === 0) return 0;
  return (mean * Math.sqrt(252)) / (downsideStd * Math.sqrt(252));
}

/** Max consecutive loss days from daily returns. */
function maxConsecutiveLossDays(dailyReturns: number[]): number {
  let max = 0;
  let current = 0;
  for (const r of dailyReturns) {
    if (r < 0) {
      current++;
      if (current > max) max = current;
    } else {
      current = 0;
    }
  }
  return max;
}

/** Monthly return standard deviation from asset history. */
function monthlyReturnStdDev(
  assetHistory: AllAssetSnapshot[],
  investorName: string,
  initialCapital: number
): number {
  if (assetHistory.length < 2) return 0;

  // Group by YYYY-MM
  const monthlyAssets = new Map<string, number[]>();
  for (const snap of assetHistory) {
    const month = snap.date.slice(0, 7);
    const asset = (snap[investorName] as number) ?? initialCapital;
    if (!monthlyAssets.has(month)) monthlyAssets.set(month, []);
    monthlyAssets.get(month)!.push(asset);
  }

  // Monthly returns: last asset of month vs first asset of month
  const months = [...monthlyAssets.keys()].sort();
  if (months.length < 2) return 0;

  const monthlyReturns: number[] = [];
  for (const month of months) {
    const assets = monthlyAssets.get(month)!;
    const first = assets[0];
    const last = assets[assets.length - 1];
    if (first > 0) monthlyReturns.push((last - first) / first);
  }

  if (monthlyReturns.length < 2) return 0;
  const mean =
    monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length;
  const variance =
    monthlyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) /
    monthlyReturns.length;
  return Math.sqrt(variance) * 100; // as percentage
}

// --- Main ---

const WEIGHTS = {
  profitability: 0.25,
  riskAdjusted: 0.25,
  defense: 0.2,
  consistency: 0.15,
  efficiency: 0.1,
  validation: 0.05,
} as const;

export function computeScorecards(
  perfStats: PerformanceStats[],
  assetHistory: AllAssetSnapshot[],
  txnSummary: Record<string, TransactionSummary>,
  backtestRuns: BacktestRun[],
  investorIds: Record<string, string>,
  initialCapital: number = 5_000_000
): InvestorScorecard[] {
  const n = perfStats.length;
  if (n === 0) return [];

  // Pre-compute daily returns for each investor
  const dailyReturnsMap: Record<string, number[]> = {};
  for (const stat of perfStats) {
    const assets = assetHistory.map(
      (row) => (row[stat.investor] as number) ?? initialCapital
    );
    const returns: number[] = [];
    for (let i = 1; i < assets.length; i++) {
      const prev = assets[i - 1];
      returns.push(prev > 0 ? (assets[i] - prev) / prev : 0);
    }
    dailyReturnsMap[stat.investor] = returns;
  }

  // 1. Profitability (25%) — cumulative return
  const profitScores = minMaxNormalize(
    perfStats.map((s) => s.totalReturnPct),
    true
  );

  // 2. Risk-adjusted (25%) — Sharpe 70% + Sortino 30%
  const sharpeRaw = perfStats.map((s) => s.sharpeRatio ?? 0);
  const sortinoRaw = perfStats.map((s) =>
    computeSortino(dailyReturnsMap[s.investor])
  );
  const sharpeNorm = minMaxNormalize(sharpeRaw, true);
  const sortinoNorm = minMaxNormalize(sortinoRaw, true);
  const riskAdjScores = perfStats.map(
    (_, i) => sharpeNorm[i] * 0.7 + sortinoNorm[i] * 0.3
  );

  // 3. Defense (20%) — MDD 60% + max consecutive loss days 40%
  const mddRaw = perfStats.map((s) => s.mdd ?? 0); // negative values
  const mddNorm = minMaxNormalize(mddRaw, true); // less negative = better = higher score
  const consLossRaw = perfStats.map((s) =>
    maxConsecutiveLossDays(dailyReturnsMap[s.investor])
  );
  const consLossNorm = minMaxNormalize(consLossRaw, false); // lower = better
  const defenseScores = perfStats.map(
    (_, i) => mddNorm[i] * 0.6 + consLossNorm[i] * 0.4
  );

  // 4. Consistency (15%) — monthly return stddev 60% + win rate 40%
  const monthStdRaw = perfStats.map((s) =>
    monthlyReturnStdDev(assetHistory, s.investor, initialCapital)
  );
  const monthStdNorm = minMaxNormalize(monthStdRaw, false); // lower = better
  const winRateRaw = perfStats.map((s) => s.winRate ?? 50);
  const winRateNorm = minMaxNormalize(winRateRaw, true);
  const consistScores = perfStats.map(
    (_, i) => monthStdNorm[i] * 0.6 + winRateNorm[i] * 0.4
  );

  // 5. Efficiency (10%) — turnover ratio 60% + fee ratio 40%
  const avgAssets = perfStats.map((s) => {
    const assets = assetHistory.map(
      (row) => (row[s.investor] as number) ?? initialCapital
    );
    return assets.reduce((a, b) => a + b, 0) / assets.length;
  });
  const turnoverRaw = perfStats.map((s, i) => {
    const id = investorIds[s.investor] ?? s.investorId;
    const txn = txnSummary[id];
    if (!txn || avgAssets[i] === 0) return 0;
    return (txn.totalBuyAmount + txn.totalSellAmount) / avgAssets[i];
  });
  const feeRatioRaw = perfStats.map((s, i) => {
    const id = investorIds[s.investor] ?? s.investorId;
    const txn = txnSummary[id];
    if (!txn || avgAssets[i] === 0) return 0;
    return txn.totalFees / avgAssets[i];
  });
  const turnoverNorm = minMaxNormalize(turnoverRaw, false);
  const feeNorm = minMaxNormalize(feeRatioRaw, false);
  const efficiencyScores = perfStats.map(
    (_, i) => turnoverNorm[i] * 0.6 + feeNorm[i] * 0.4
  );

  // 6. Validation (5%) — backtest vs live divergence
  const latestRun = backtestRuns.length > 0 ? backtestRuns[0] : null;
  const validationScores: number[] = (() => {
    if (!latestRun) return perfStats.map(() => 50); // neutral if no backtest

    const btMap = new Map<string, number>();
    for (const r of latestRun.summary.rankings) {
      btMap.set(r.investor_id, r.cumulative_return_pct);
    }

    const divergences = perfStats.map((s) => {
      const id = investorIds[s.investor] ?? s.investorId;
      const btReturn = btMap.get(id);
      if (btReturn === undefined) return 0; // neutral
      return Math.abs(s.totalReturnPct - btReturn);
    });

    return minMaxNormalize(divergences, false); // lower divergence = better
  })();

  // Assemble scorecards
  const scorecards: InvestorScorecard[] = perfStats.map((s, i) => {
    const id = investorIds[s.investor] ?? s.investorId;
    const txn = txnSummary[id];

    const categories = {
      profitability: {
        score: Math.round(profitScores[i] * 10) / 10,
        rank: 0,
        details: { cumulativeReturnPct: s.totalReturnPct },
      },
      riskAdjusted: {
        score: Math.round(riskAdjScores[i] * 10) / 10,
        rank: 0,
        details: {
          sharpeRatio: sharpeRaw[i],
          sortinoRatio: sortinoRaw[i],
        },
      },
      defense: {
        score: Math.round(defenseScores[i] * 10) / 10,
        rank: 0,
        details: {
          mddPct: mddRaw[i],
          maxConsecutiveLossDays: consLossRaw[i],
        },
      },
      consistency: {
        score: Math.round(consistScores[i] * 10) / 10,
        rank: 0,
        details: {
          monthlyReturnStdDev: monthStdRaw[i],
          winRatePct: winRateRaw[i],
        },
      },
      efficiency: {
        score: Math.round(efficiencyScores[i] * 10) / 10,
        rank: 0,
        details: {
          turnoverRatio: turnoverRaw[i],
          feeRatio: feeRatioRaw[i],
          totalFees: txn?.totalFees ?? 0,
        },
      },
      validation: {
        score: Math.round(validationScores[i] * 10) / 10,
        rank: 0,
        details: {
          liveReturnPct: s.totalReturnPct,
          backtestReturnPct:
            latestRun?.summary.rankings.find((r) => r.investor_id === id)
              ?.cumulative_return_pct ?? 0,
        },
      },
    };

    const totalScore =
      Math.round(
        (categories.profitability.score * WEIGHTS.profitability +
          categories.riskAdjusted.score * WEIGHTS.riskAdjusted +
          categories.defense.score * WEIGHTS.defense +
          categories.consistency.score * WEIGHTS.consistency +
          categories.efficiency.score * WEIGHTS.efficiency +
          categories.validation.score * WEIGHTS.validation) *
          10
      ) / 10;

    return {
      investor: s.investor,
      investorId: id,
      totalScore,
      rank: 0,
      recommended: false,
      categories,
    };
  });

  // Assign ranks per category
  const catKeys = [
    "profitability",
    "riskAdjusted",
    "defense",
    "consistency",
    "efficiency",
    "validation",
  ] as const;
  for (const key of catKeys) {
    const ranks = assignRanks(scorecards.map((sc) => sc.categories[key].score));
    scorecards.forEach((sc, i) => {
      sc.categories[key].rank = ranks[i];
    });
  }

  // Assign overall ranks
  const totalRanks = assignRanks(scorecards.map((sc) => sc.totalScore));
  scorecards.forEach((sc, i) => {
    sc.rank = totalRanks[i];
    sc.recommended = totalRanks[i] <= 3;
  });

  // Sort by rank
  scorecards.sort((a, b) => a.rank - b.rank);

  return scorecards;
}

export const CATEGORY_LABELS: Record<string, string> = {
  profitability: "수익성",
  riskAdjusted: "위험조정",
  defense: "방어력",
  consistency: "일관성",
  efficiency: "효율성",
  validation: "검증",
};

export const CATEGORY_KEYS = [
  "profitability",
  "riskAdjusted",
  "defense",
  "consistency",
  "efficiency",
  "validation",
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];
