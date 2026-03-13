import Link from "next/link";
import InvestorAvatar from "./InvestorAvatar";

interface Props {
  idA: string;
  nameA: string;
  strategyA: string;
  idB: string;
  nameB: string;
  strategyB: string;
  description: string;
}

export default function MatchupCard({
  idA, nameA, strategyA, idB, nameB, strategyB, description,
}: Props) {
  return (
    <Link
      href={`/versus/${idA}-vs-${idB}`}
      className="block bg-white/[0.02] hover:bg-white/[0.05] rounded-xl p-4 border border-white/5 transition-all duration-200 hover:-translate-y-0.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col items-center flex-1 gap-1.5">
          <InvestorAvatar investorId={idA} size="md" />
          <div className="text-sm font-bold text-gray-200">{nameA}</div>
          <div className="text-[10px] text-gray-500">{strategyA}</div>
        </div>
        <div className="shrink-0 px-2 py-1 rounded-full bg-gradient-to-r from-red-500/20 to-blue-500/20 text-xs font-bold text-gray-300">
          VS
        </div>
        <div className="flex flex-col items-center flex-1 gap-1.5">
          <InvestorAvatar investorId={idB} size="md" />
          <div className="text-sm font-bold text-gray-200">{nameB}</div>
          <div className="text-[10px] text-gray-500">{strategyB}</div>
        </div>
      </div>
      <div className="text-[10px] text-gray-500 mt-2 text-center">{description}</div>
    </Link>
  );
}
