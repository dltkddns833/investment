"use client";

import type { InvestorDetail, StockUniverse } from "@/lib/data";
import { SectorIcon } from "@/lib/sector-icons";

interface Props {
  investorDetails: Record<string, InvestorDetail>;
  stocks: StockUniverse[];
}

const SECTOR_COLORS: Record<string, string> = {
  반도체: "bg-blue-500",
  "IT/플랫폼": "bg-indigo-500",
  바이오: "bg-green-500",
  자동차: "bg-orange-500",
  방산: "bg-red-500",
  "방산/항공": "bg-red-400",
  금융: "bg-yellow-500",
  보험: "bg-yellow-600",
  엔터: "bg-pink-500",
  철강: "bg-gray-500",
  통신: "bg-purple-500",
  화학: "bg-cyan-500",
  "에너지/화학": "bg-teal-500",
  "원전/에너지": "bg-emerald-500",
  "2차전지": "bg-sky-500",
  "2차전지 소재": "bg-sky-400",
  게임: "bg-violet-500",
  조선: "bg-stone-500",
  "조선/중공업": "bg-stone-400",
  건설: "bg-slate-500",
  "건설/지주": "bg-slate-400",
  제약: "bg-lime-500",
  화장품: "bg-fuchsia-500",
  식품: "bg-amber-600",
};

function getSectorColor(sector: string): string {
  return SECTOR_COLORS[sector] ?? "bg-gray-500";
}

export default function SectorWeights({ investorDetails, stocks }: Props) {
  // Build ticker → sector map
  const tickerSector = new Map<string, string>();
  for (const s of stocks) tickerSector.set(s.ticker, s.sector);

  // Calculate sector weights per investor
  const investors = Object.entries(investorDetails).map(([name, detail]) => {
    const sectorValues = new Map<string, number>();
    let totalValue = 0;

    for (const [ticker, holding] of Object.entries(detail.holdings)) {
      const sector = tickerSector.get(ticker) ?? "기타";
      sectorValues.set(sector, (sectorValues.get(sector) ?? 0) + holding.value);
      totalValue += holding.value;
    }

    const sectors = [...sectorValues.entries()]
      .map(([sector, value]) => ({
        sector,
        value,
        pct: totalValue > 0 ? (value / totalValue) * 100 : 0,
      }))
      .sort((a, b) => b.pct - a.pct);

    return { name, sectors, totalValue };
  });

  // Collect all sectors for legend
  const allSectors = [...new Set(investors.flatMap((inv) => inv.sectors.map((s) => s.sector)))];

  return (
    <div>
      <div className="space-y-3">
        {investors.map((inv) => (
          <div key={inv.name} className="flex items-center gap-3">
            <div className="w-16 text-sm truncate shrink-0">{inv.name}</div>
            <div className="flex-1 flex h-6 rounded-full overflow-hidden bg-gray-700/30">
              {inv.sectors.map((s) => (
                <div
                  key={s.sector}
                  className={`${getSectorColor(s.sector)} transition-all`}
                  style={{ width: `${s.pct}%` }}
                  title={`${s.sector} ${s.pct.toFixed(1)}%`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4">
        {allSectors.map((sector) => (
          <div key={sector} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${getSectorColor(sector)}`} />
            <SectorIcon sector={sector} className="w-3 h-3 text-gray-500" />
            <span className="text-xs text-gray-400">{sector}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
