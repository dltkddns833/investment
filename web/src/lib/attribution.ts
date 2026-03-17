/**
 * 성과 기여도 분석 — 순수 함수 (supabase 의존 없음, 클라이언트에서도 사용 가능)
 */
import type { InvestorDetail, StockUniverse } from "./data";

export interface StockAttribution {
  ticker: string;
  name: string;
  sector: string;
  profit: number;
  contributionPct: number;
  weight: number;
  profitPct: number;
}

export interface SectorAttribution {
  sector: string;
  profit: number;
  contributionPct: number;
  weight: number;
  stockCount: number;
  stocks: StockAttribution[];
}

export interface InvestorAttribution {
  investor: string;
  investorId: string;
  totalReturn: number;
  totalReturnPct: number;
  stockAttributions: StockAttribution[];
  sectorAttributions: SectorAttribution[];
}

export function computeAttribution(
  investorName: string,
  investorId: string,
  detail: InvestorDetail,
  stockUniverse: StockUniverse[]
): InvestorAttribution {
  const nameToTicker: Record<string, string> = {};
  const nameToSector: Record<string, string> = {};
  for (const s of stockUniverse) {
    nameToTicker[s.name] = s.ticker;
    nameToSector[s.name] = s.sector;
  }

  const stockAttrs: StockAttribution[] = [];
  const totalReturn = detail.total_return;
  const totalAsset = detail.total_asset;

  for (const [ticker, h] of Object.entries(detail.holdings)) {
    const sector = nameToSector[h.name] ?? nameToTicker[h.name] ? nameToSector[h.name] : "기타";
    const contributionPct = totalReturn !== 0
      ? (h.profit / totalReturn) * 100
      : 0;
    const weight = totalAsset > 0 ? (h.value / totalAsset) * 100 : 0;

    stockAttrs.push({
      ticker: nameToTicker[h.name] ?? ticker,
      name: h.name,
      sector: sector ?? "기타",
      profit: h.profit,
      contributionPct: Math.round(contributionPct * 10) / 10,
      weight: Math.round(weight * 10) / 10,
      profitPct: h.profit_pct,
    });
  }

  stockAttrs.sort((a, b) => Math.abs(b.contributionPct) - Math.abs(a.contributionPct));

  // 섹터별 집계
  const sectorMap: Record<string, { profit: number; value: number; stocks: StockAttribution[] }> = {};
  for (const s of stockAttrs) {
    if (!sectorMap[s.sector]) sectorMap[s.sector] = { profit: 0, value: 0, stocks: [] };
    sectorMap[s.sector].profit += s.profit;
    sectorMap[s.sector].value += (totalAsset > 0 ? (s.weight / 100) * totalAsset : 0);
    sectorMap[s.sector].stocks.push(s);
  }

  const sectorAttrs: SectorAttribution[] = Object.entries(sectorMap).map(([sector, data]) => ({
    sector,
    profit: data.profit,
    contributionPct: totalReturn !== 0 ? Math.round((data.profit / totalReturn) * 1000) / 10 : 0,
    weight: totalAsset > 0 ? Math.round((data.value / totalAsset) * 1000) / 10 : 0,
    stockCount: data.stocks.length,
    stocks: data.stocks,
  }));

  sectorAttrs.sort((a, b) => Math.abs(b.contributionPct) - Math.abs(a.contributionPct));

  return {
    investor: investorName,
    investorId,
    totalReturn,
    totalReturnPct: detail.total_return_pct,
    stockAttributions: stockAttrs,
    sectorAttributions: sectorAttrs,
  };
}

export function computeAllAttributions(
  investorDetails: Record<string, InvestorDetail>,
  investorIdMap: Record<string, string>,
  stockUniverse: StockUniverse[]
): InvestorAttribution[] {
  return Object.entries(investorDetails).map(([name, detail]) =>
    computeAttribution(name, investorIdMap[name] ?? "", detail, stockUniverse)
  );
}
