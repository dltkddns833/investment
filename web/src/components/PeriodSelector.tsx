"use client";

import { useRouter, useSearchParams } from "next/navigation";
import InvestorAvatar from "./InvestorAvatar";

interface Investor {
  id: string;
  name: string;
}

interface Props {
  investors: Investor[];
  currentInvestor: string | null;
  year: number;
  month: number;
}

export default function PeriodSelector({
  investors,
  currentInvestor,
  year,
  month,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(inv: string | null, y: number, m: number) {
    const params = new URLSearchParams();
    if (inv) params.set("investor", inv);
    params.set("month", `${y}-${String(m).padStart(2, "0")}`);
    router.push(`/reports?${params.toString()}`);
  }

  function prevMonth() {
    const m = month === 1 ? 12 : month - 1;
    const y = month === 1 ? year - 1 : year;
    navigate(currentInvestor, y, m);
  }

  function nextMonth() {
    const m = month === 12 ? 1 : month + 1;
    const y = month === 12 ? year + 1 : year;
    navigate(currentInvestor, y, m);
  }

  return (
    <div className="space-y-4 animate-in">
      {/* Month navigation */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={prevMonth}
          className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-lg font-bold min-w-[140px] text-center">
          {year}년 {month}월
        </span>
        <button
          onClick={nextMonth}
          className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Investor tabs */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => navigate(null, year, month)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            !currentInvestor
              ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
              : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
          }`}
        >
          전체 평균
        </button>
        {investors.map((inv) => (
          <button
            key={inv.id}
            onClick={() => navigate(inv.id, year, month)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              currentInvestor === inv.id
                ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
            }`}
          >
            <InvestorAvatar investorId={inv.id} size="sm" />
            {inv.name}
          </button>
        ))}
      </div>
    </div>
  );
}
