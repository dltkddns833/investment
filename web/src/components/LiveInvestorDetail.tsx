"use client";

import { InvestorDetail } from "@/lib/data";
import { useLiveInvestorDetail } from "@/lib/use-live-portfolio";
import HoldingsTable from "./HoldingsTable";
import PortfolioChart from "./PortfolioChart";

interface Props {
  detail: InvestorDetail;
  initialCapital: number;
}

export default function LiveInvestorDetail({
  detail,
  initialCapital,
}: Props) {
  const liveDetail = useLiveInvestorDetail(detail, initialCapital);
  const d = liveDetail ?? detail;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
      <section className="glass-card p-4 md:p-5 animate-in">
        <h2 className="text-lg font-bold mb-3 section-header">
          포트폴리오 구성
        </h2>
        <PortfolioChart detail={d} />
      </section>

      <section className="glass-card overflow-hidden animate-in">
        <HoldingsTable holdings={d.holdings} />
      </section>
    </div>
  );
}
