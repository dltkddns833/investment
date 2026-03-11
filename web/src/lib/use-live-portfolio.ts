"use client";

import { useLivePrices } from "./live-prices";
import type { RankingEntry, InvestorDetail } from "./data";

/**
 * Recalculate a single investor's total_asset and return using live prices.
 */
function recalcDetail(
  detail: InvestorDetail,
  livePrices: Record<string, { price: number; change_pct: number }>,
  initialCapital: number
): InvestorDetail {
  let stockValue = 0;
  const newHoldings: typeof detail.holdings = {};

  for (const [ticker, h] of Object.entries(detail.holdings)) {
    const live = livePrices[ticker];
    const currentPrice = live ? live.price : h.current_price;
    const value = currentPrice * h.shares;
    const profitPct =
      h.avg_price > 0
        ? +((((currentPrice - h.avg_price) / h.avg_price) * 100).toFixed(2))
        : 0;
    stockValue += value;
    newHoldings[ticker] = {
      ...h,
      current_price: currentPrice,
      value,
      profit_pct: profitPct,
    };
  }

  const totalAsset = detail.cash + stockValue;
  const totalReturnPct =
    initialCapital > 0
      ? +((((totalAsset - initialCapital) / initialCapital) * 100).toFixed(2))
      : 0;

  return {
    ...detail,
    holdings: newHoldings,
    total_asset: totalAsset,
    total_return_pct: totalReturnPct,
  };
}

/**
 * Recalculate rankings using live prices.
 */
export function useLiveRankings(
  storedRankings: RankingEntry[],
  investorDetails: Record<string, InvestorDetail>,
  initialCapital: number
): RankingEntry[] {
  const { prices: livePrices, isLive } = useLivePrices();
  if (!isLive || !livePrices) return storedRankings;

  const updated = storedRankings.map((r) => {
    const detail = investorDetails[r.investor];
    if (!detail) return r;
    const recalc = recalcDetail(detail, livePrices, initialCapital);
    return {
      ...r,
      total_asset: recalc.total_asset,
      total_return_pct: recalc.total_return_pct,
    };
  });

  // Re-rank by total_asset descending
  updated.sort((a, b) => b.total_asset - a.total_asset);
  updated.forEach((r, i) => (r.rank = i + 1));

  return updated;
}

/**
 * Recalculate a single investor detail using live prices.
 */
export function useLiveInvestorDetail(
  detail: InvestorDetail | undefined,
  initialCapital: number
): InvestorDetail | undefined {
  const { prices: livePrices, isLive } = useLivePrices();
  if (!detail || !isLive || !livePrices) return detail;
  return recalcDetail(detail, livePrices, initialCapital);
}
