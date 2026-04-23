import Link from "next/link";
import InvestorAvatar from "./InvestorAvatar";
import { getInvestorHex } from "@/lib/investor-colors";

interface Props {
  investorId: string;
  investorName: string;
  strategy: string;
  startDate: string;
}

export default function LiveFollowBanner({
  investorId,
  investorName,
  strategy,
  startDate,
}: Props) {
  const hex = getInvestorHex(investorId);
  return (
    <Link
      href={`/investors/${investorId}`}
      className="block rounded-xl border overflow-hidden group"
      style={{
        background: `linear-gradient(135deg, ${hex}22 0%, ${hex}0a 100%)`,
        borderColor: `${hex}40`,
      }}
    >
      <div className="flex items-center gap-4 p-4 sm:p-5">
        <div
          className="shrink-0 rounded-full p-1"
          style={{ backgroundColor: `${hex}33` }}
        >
          <InvestorAvatar investorId={investorId} size="lg" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${hex}33`, color: hex }}
            >
              추종 중
            </span>
            <h2 className="text-base sm:text-lg font-bold text-white truncate">
              {investorName} ({investorId})
            </h2>
          </div>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{strategy}</p>
          <p className="text-[11px] text-gray-500 mt-1">
            {startDate}부터 추종 시작 — 매일 {investorName}의 allocation을 그대로 복제
          </p>
        </div>
        <div className="shrink-0 text-gray-500 group-hover:text-gray-300 transition-colors">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>
      </div>
    </Link>
  );
}
