"use client";

import { InvestorDetail } from "@/lib/data";
import { useLiveInvestorDetail } from "@/lib/use-live-portfolio";
import HoldingsTable from "./HoldingsTable";
import PortfolioChart from "./PortfolioChart";

interface AllocationData {
  rationale: string;
  allocation: Record<string, number>;
}

interface Props {
  detail: InvestorDetail;
  initialCapital: number;
  allocation?: AllocationData | null;
  marketPrices?: Record<string, { name: string }> | null;
}

export default function LiveInvestorDetail({
  detail,
  initialCapital,
  allocation,
  marketPrices,
}: Props) {
  const liveDetail = useLiveInvestorDetail(detail, initialCapital);
  const d = liveDetail ?? detail;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-3 section-header">
            포트폴리오 구성
          </h2>
          <PortfolioChart detail={d} />
        </section>

        {allocation ? (
          <section className="glass-card p-4 md:p-5 animate-in">
            <h2 className="text-lg font-bold mb-3 section-header">
              목표 배분
            </h2>
            <p className="text-xs text-gray-400 mb-3 whitespace-pre-line">
              {allocation.rationale}
            </p>
            <div className="space-y-2">
              {Object.entries(allocation.allocation).map(
                ([ticker, ratio]) => (
                  <div key={ticker} className="flex items-center gap-2">
                    <div className="w-16 md:w-20 text-sm truncate shrink-0">
                      {marketPrices?.[ticker]?.name ?? ticker}
                    </div>
                    <div className="flex-1 bg-gray-700/50 rounded-full h-2">
                      <div
                        className="bar-fill h-2"
                        style={{ width: `${ratio * 100}%` }}
                      />
                    </div>
                    <div className="text-sm text-gray-400 w-12 text-right tabular-nums">
                      {(ratio * 100).toFixed(0)}%
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        ) : (
          <div />
        )}
      </div>

      <section className="glass-card overflow-hidden animate-in">
        <HoldingsTable holdings={d.holdings} />
      </section>
    </div>
  );
}
