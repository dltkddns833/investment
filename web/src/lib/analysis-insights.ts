import type { InvestorScorecard } from "./scorecard";
import type {
  PerformanceStats,
  CorrelationEntry,
  PositionOverlap,
  StockPopularity,
} from "./data";
import type { RegimePerformance } from "./regime-analysis";
import type { InvestorAttribution } from "./attribution";

// --- 전략 스코어카드 ---

export function getScorecardInsight(scorecards: InvestorScorecard[]): string {
  if (scorecards.length === 0) return "";
  const sorted = [...scorecards].sort((a, b) => b.totalScore - a.totalScore);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];

  // 1위의 강점 카테고리
  const catLabels: Record<string, string> = {
    profitability: "수익성",
    riskAdjusted: "위험조정",
    defense: "방어력",
    consistency: "일관성",
    efficiency: "효율성",
    validation: "검증력",
  };
  const topCats = Object.entries(top.categories)
    .sort(([, a], [, b]) => b.score - a.score)
    .slice(0, 2)
    .map(([k]) => catLabels[k] ?? k);

  const recommended = sorted.filter((s) => s.recommended);
  const recNames = recommended.map((s) => s.investor).join(", ");

  const parts: string[] = [];
  parts.push(
    `종합 1위 ${top.investor}(${top.totalScore.toFixed(0)}점)는 ${topCats.join("·")}에서 강점을 보이고 있습니다.`
  );
  if (recommended.length > 0) {
    parts.push(`실전 추천 전략: ${recNames}.`);
  }
  // 1위와 꼴찌 점수 차이
  const gap = top.totalScore - bottom.totalScore;
  if (gap > 30) {
    parts.push(
      `최하위 ${bottom.investor}(${bottom.totalScore.toFixed(0)}점)와 ${gap.toFixed(0)}점 차이로 전략 간 편차가 큽니다.`
    );
  }

  return parts.join(" ");
}

// --- 성과 지표 ---

export function getPerfStatsInsight(stats: PerformanceStats[]): string {
  if (stats.length === 0) return "";
  const parts: string[] = [];

  // 샤프비율 1위
  const withSharpe = stats.filter((s) => s.sharpeRatio !== null);
  if (withSharpe.length > 0) {
    const bestSharpe = withSharpe.reduce((a, b) =>
      (a.sharpeRatio ?? -999) > (b.sharpeRatio ?? -999) ? a : b
    );
    parts.push(
      `위험 대비 효율은 ${bestSharpe.investor}(샤프 ${bestSharpe.sharpeRatio!.toFixed(2)})가 최고입니다.`
    );
  }

  // MDD 최악
  const withMdd = stats.filter((s) => s.mdd !== null);
  if (withMdd.length > 0) {
    const worstMdd = withMdd.reduce((a, b) =>
      (a.mdd ?? 0) < (b.mdd ?? 0) ? a : b
    );
    parts.push(
      `최대 낙폭은 ${worstMdd.investor}(${worstMdd.mdd!.toFixed(1)}%)가 가장 깊어 하방 리스크에 주의가 필요합니다.`
    );
  }

  // 알파 양수 개수
  const positiveAlpha = stats.filter((s) => (s.alpha ?? 0) > 0);
  const negativeAlpha = stats.filter((s) => (s.alpha ?? 0) < 0);
  if (positiveAlpha.length > 0) {
    parts.push(
      `벤치마크 대비 초과수익(알파)을 달성한 전략은 ${positiveAlpha.length}개, 미달은 ${negativeAlpha.length}개입니다.`
    );
  }

  return parts.join(" ");
}

// --- 국면별 성과 ---

export function getRegimeInsight(performances: RegimePerformance[]): string {
  if (performances.length === 0) return "";
  const parts: string[] = [];

  const findBest = (regime: "bull" | "neutral" | "bear") => {
    let best: RegimePerformance | null = null;
    for (const p of performances) {
      const data = p[regime];
      if (data && (!best || data.returnPct > (best[regime]?.returnPct ?? -Infinity))) {
        best = p;
      }
    }
    return best;
  };

  const findWorst = (regime: "bull" | "neutral" | "bear") => {
    let worst: RegimePerformance | null = null;
    for (const p of performances) {
      const data = p[regime];
      if (data && (!worst || data.returnPct < (worst[regime]?.returnPct ?? Infinity))) {
        worst = p;
      }
    }
    return worst;
  };

  const bullBest = findBest("bull");
  const bearBest = findBest("bear");
  const bearWorst = findWorst("bear");

  if (bullBest?.bull) {
    parts.push(
      `강세장에서 ${bullBest.investor}(${bullBest.bull.returnPct >= 0 ? "+" : ""}${bullBest.bull.returnPct.toFixed(1)}%)가 가장 공격적으로 수익을 냈습니다.`
    );
  }
  if (bearBest?.bear) {
    parts.push(
      `약세장 방어는 ${bearBest.investor}(${bearBest.bear.returnPct >= 0 ? "+" : ""}${bearBest.bear.returnPct.toFixed(1)}%)가 가장 우수합니다.`
    );
  }
  if (bearWorst?.bear && bearBest && bearWorst.investor !== bearBest.investor) {
    parts.push(
      `반면 ${bearWorst.investor}(${bearWorst.bear.returnPct.toFixed(1)}%)는 약세장에서 가장 큰 타격을 받았습니다.`
    );
  }

  return parts.join(" ");
}

// --- 수익률 상관관계 ---

export function getCorrelationInsight(
  correlations: CorrelationEntry[]
): string {
  if (correlations.length === 0) return "";
  const parts: string[] = [];

  const sorted = [...correlations].sort(
    (a, b) => a.correlation - b.correlation
  );
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];

  if (lowest) {
    parts.push(
      `${lowest.investorA}↔${lowest.investorB}(${lowest.correlation.toFixed(2)})가 가장 낮은 상관관계로 분산 조합에 적합합니다.`
    );
  }
  if (highest && highest.correlation > 0.7) {
    parts.push(
      `${highest.investorA}↔${highest.investorB}(${highest.correlation.toFixed(2)})는 거의 동일하게 움직여 함께 보유 시 분산 효과가 제한적입니다.`
    );
  }

  // 평균 상관계수
  const avgCorr =
    correlations.reduce((s, c) => s + c.correlation, 0) / correlations.length;
  if (avgCorr > 0.5) {
    parts.push(
      `전체 평균 상관계수 ${avgCorr.toFixed(2)}로 전략 간 동조화 경향이 있습니다.`
    );
  } else if (avgCorr < 0.3) {
    parts.push(
      `전체 평균 상관계수 ${avgCorr.toFixed(2)}로 전략 간 독립성이 양호합니다.`
    );
  }

  return parts.join(" ");
}

// --- 포지션 겹침률 ---

export function getOverlapInsight(overlaps: PositionOverlap[]): string {
  if (overlaps.length === 0) return "";
  const parts: string[] = [];

  const sorted = [...overlaps].sort((a, b) => b.overlap - a.overlap);
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];

  if (highest && highest.overlap > 0) {
    parts.push(
      `${highest.investorA}↔${highest.investorB}(${(highest.overlap * 100).toFixed(0)}%)가 가장 유사한 포트폴리오를 구성하고 있습니다.`
    );
  }
  if (lowest && lowest.overlap === 0) {
    const zeroOverlaps = sorted.filter((o) => o.overlap === 0);
    parts.push(`완전히 겹치지 않는 조합이 ${zeroOverlaps.length}쌍 있어 전략 다양성이 확보되어 있습니다.`);
  } else if (lowest) {
    parts.push(
      `${lowest.investorA}↔${lowest.investorB}(${(lowest.overlap * 100).toFixed(0)}%)가 가장 독립적인 종목 선택을 보여줍니다.`
    );
  }

  return parts.join(" ");
}

// --- 종목 인기도 ---

export function getPopularityInsight(popularity: StockPopularity[]): string {
  if (popularity.length === 0) return "";
  const parts: string[] = [];

  const sorted = [...popularity].sort(
    (a, b) => b.holderCount - a.holderCount
  );
  const top3 = sorted.slice(0, 3);
  const soloHoldings = sorted.filter((s) => s.holderCount === 1);

  if (top3.length > 0) {
    const topNames = top3
      .map((s) => `${s.name}(${s.holderCount}명)`)
      .join(", ");
    parts.push(`최다 보유 종목은 ${topNames}으로 전략 간 컨센서스가 형성되어 있습니다.`);
  }

  if (soloHoldings.length > 0) {
    parts.push(
      `단독 보유 종목이 ${soloHoldings.length}개로, 독자적 판단에 의한 차별화된 포지션도 존재합니다.`
    );
  }

  return parts.join(" ");
}

// --- 성과 기여도 ---

export function getAttributionInsight(
  attributions: InvestorAttribution[]
): string {
  if (attributions.length === 0) return "";
  const parts: string[] = [];

  // 가장 수익 기여가 큰 섹터 찾기 (전체 투자자 합산)
  const sectorProfitMap: Record<string, number> = {};
  for (const inv of attributions) {
    for (const sec of inv.sectorAttributions) {
      sectorProfitMap[sec.sector] =
        (sectorProfitMap[sec.sector] ?? 0) + sec.profit;
    }
  }

  const sectorEntries = Object.entries(sectorProfitMap).sort(
    ([, a], [, b]) => b - a
  );
  const bestSector = sectorEntries[0];
  const worstSector = sectorEntries[sectorEntries.length - 1];

  if (bestSector && bestSector[1] > 0) {
    parts.push(`전체 투자자 합산 기준 ${bestSector[0]} 섹터가 가장 큰 수익을 기여하고 있습니다.`);
  }
  if (worstSector && worstSector[1] < 0) {
    parts.push(`${worstSector[0]} 섹터는 손실 기여가 가장 커 리스크 요인으로 작용 중입니다.`);
  }

  // 수익 기여도 편차가 큰 투자자
  const bestReturn = attributions.reduce((a, b) =>
    a.totalReturnPct > b.totalReturnPct ? a : b
  );
  if (bestReturn.totalReturnPct > 0) {
    const topSector = bestReturn.sectorAttributions.sort(
      (a, b) => b.profit - a.profit
    )[0];
    if (topSector) {
      parts.push(
        `${bestReturn.investor}의 수익은 ${topSector.sector} 섹터(${topSector.contributionPct >= 0 ? "+" : ""}${topSector.contributionPct.toFixed(1)}%p)에서 주로 발생했습니다.`
      );
    }
  }

  return parts.join(" ");
}
