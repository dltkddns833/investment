import type { MarketPrice, StockUniverse } from "@/lib/data";
import Link from "next/link";

interface Props {
  stocks: StockUniverse[];
  marketPrices: Record<string, MarketPrice>;
}

function getColor(pct: number): string {
  if (pct > 3) return "bg-red-700 text-white";
  if (pct > 1.5) return "bg-red-500 text-white";
  if (pct > 0.3) return "bg-red-400/50 text-red-200";
  if (pct >= -0.3) return "bg-slate-800 text-gray-400";
  if (pct >= -1.5) return "bg-blue-400/50 text-blue-200";
  if (pct >= -3) return "bg-blue-500 text-white";
  return "bg-blue-700 text-white";
}

export default function SectorHeatmap({ stocks, marketPrices }: Props) {
  // Group by sector
  const sectors = new Map<string, { ticker: string; name: string; change_pct: number }[]>();
  for (const stock of stocks) {
    const price = marketPrices[stock.ticker];
    if (!price) continue;
    const list = sectors.get(stock.sector) ?? [];
    list.push({ ticker: stock.ticker, name: stock.name, change_pct: price.change_pct });
    sectors.set(stock.sector, list);
  }

  // Sort sectors by average change
  const sorted = [...sectors.entries()]
    .map(([sector, items]) => ({
      sector,
      items: items.sort((a, b) => b.change_pct - a.change_pct),
      avg: items.reduce((s, i) => s + i.change_pct, 0) / items.length,
    }))
    .sort((a, b) => b.avg - a.avg);

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {sorted.map(({ sector, items, avg }) => (
          <div key={sector} className="border border-white/5 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className="text-sm font-medium text-gray-300">{sector}</h3>
              <span
                className={`text-xs tabular-nums ${
                  avg > 0 ? "text-red-400" : avg < 0 ? "text-blue-400" : "text-gray-500"
                }`}
              >
                {avg > 0 ? "+" : ""}
                {avg.toFixed(2)}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {items.map((item) => (
                <Link
                  key={item.ticker}
                  href={`/stocks/${item.ticker}`}
                  className={`rounded-lg p-2 text-center transition-transform hover:scale-[1.03] ${getColor(item.change_pct)}`}
                >
                  <div className="text-xs font-medium truncate">{item.name}</div>
                  <div className="text-sm font-bold tabular-nums mt-0.5">
                    {item.change_pct > 0 ? "+" : ""}
                    {item.change_pct.toFixed(2)}%
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 mt-3">
        <span>하락</span>
        <div className="w-4 h-3 rounded-sm bg-blue-700" />
        <div className="w-4 h-3 rounded-sm bg-blue-500" />
        <div className="w-4 h-3 rounded-sm bg-blue-400/50" />
        <div className="w-4 h-3 rounded-sm bg-slate-800 border border-white/10" />
        <div className="w-4 h-3 rounded-sm bg-red-400/50" />
        <div className="w-4 h-3 rounded-sm bg-red-500" />
        <div className="w-4 h-3 rounded-sm bg-red-700" />
        <span>상승</span>
      </div>
    </div>
  );
}
