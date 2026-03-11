"use client";

import { InvestorDetail } from "@/lib/data";
import { krw, pct, signColor } from "@/lib/format";
import { useLiveInvestorDetail } from "@/lib/use-live-portfolio";

interface Props {
  detail: InvestorDetail | undefined;
  initialCapital: number;
  cash: number;
  rebalanceFrequency: number;
  rebalanceCount: number;
}

export default function LiveInvestorSummary({
  detail,
  initialCapital,
  cash,
  rebalanceFrequency,
  rebalanceCount,
}: Props) {
  const liveDetail = useLiveInvestorDetail(detail, initialCapital);
  const d = liveDetail ?? detail;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 stagger">
      <div className="glass-card card-shine animate-in p-4">
        <div className="text-gray-400 text-xs uppercase tracking-wider">
          총 자산
        </div>
        <div className="text-base md:text-lg font-bold mt-1 tabular-nums">
          {d ? krw(d.total_asset) : krw(initialCapital)}
        </div>
      </div>
      <div className="glass-card card-shine animate-in p-4">
        <div className="text-gray-400 text-xs uppercase tracking-wider">
          수익률
        </div>
        <div
          className={`text-base md:text-lg font-bold mt-1 tabular-nums ${d ? signColor(d.total_return_pct) : "text-gray-500"}`}
        >
          {d ? pct(d.total_return_pct) : "0.00%"}
        </div>
      </div>
      <div className="glass-card card-shine animate-in p-4">
        <div className="text-gray-400 text-xs uppercase tracking-wider">
          현금
        </div>
        <div className="text-base md:text-lg font-bold mt-1 tabular-nums">
          {krw(cash)}
        </div>
      </div>
      <div className="glass-card card-shine animate-in p-4">
        <div className="text-gray-400 text-xs uppercase tracking-wider">
          리밸런싱
        </div>
        <div className="text-base md:text-lg font-bold mt-1">
          {rebalanceFrequency}일마다
        </div>
        <div className="text-xs text-gray-500">총 {rebalanceCount}회</div>
      </div>
    </div>
  );
}
