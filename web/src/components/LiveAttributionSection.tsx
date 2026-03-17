"use client";

import { useLiveInvestorDetail } from "@/lib/use-live-portfolio";
import { computeAttribution } from "@/lib/attribution";
import type { InvestorDetail, StockUniverse } from "@/lib/data";
import StockAttributionChart from "./StockAttributionChart";
import SectorAttributionChart from "./SectorAttributionChart";

interface Props {
  detail: InvestorDetail;
  initialCapital: number;
  investorName: string;
  investorId: string;
  stockUniverse: StockUniverse[];
}

export default function LiveAttributionSection({
  detail,
  initialCapital,
  investorName,
  investorId,
  stockUniverse,
}: Props) {
  const liveDetail = useLiveInvestorDetail(detail, initialCapital);
  const d = liveDetail ?? detail;
  const attribution = computeAttribution(investorName, investorId, d, stockUniverse);

  return (
    <section className="glass-card p-4 md:p-5 animate-in">
      <h2 className="text-lg font-bold mb-1 section-header">성과 기여도</h2>
      <p className="text-xs text-gray-500 mb-4">
        종목별·섹터별 수익 기여도 분석
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-2">종목별 기여도</h3>
          <StockAttributionChart
            attributions={attribution.stockAttributions}
            totalReturn={d.total_return}
          />
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-2">섹터별 기여도</h3>
          <SectorAttributionChart
            sectorAttributions={attribution.sectorAttributions}
          />
        </div>
      </div>
    </section>
  );
}
