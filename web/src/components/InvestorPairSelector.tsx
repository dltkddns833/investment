"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  investors: { id: string; name: string }[];
}

export default function InvestorPairSelector({ investors }: Props) {
  const [a, setA] = useState(investors[0]?.id ?? "");
  const [b, setB] = useState(investors[1]?.id ?? "");
  const router = useRouter();

  const handleGo = () => {
    if (a && b && a !== b) {
      router.push(`/versus/${a}-vs-${b}`);
    }
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <select
        value={a}
        onChange={(e) => setA(e.target.value)}
        className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {investors.map((inv) => (
          <option key={inv.id} value={inv.id}>{inv.name}</option>
        ))}
      </select>
      <span className="text-gray-500 font-bold">VS</span>
      <select
        value={b}
        onChange={(e) => setB(e.target.value)}
        className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {investors.map((inv) => (
          <option key={inv.id} value={inv.id}>{inv.name}</option>
        ))}
      </select>
      <button
        onClick={handleGo}
        disabled={a === b}
        className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        대결 보기
      </button>
    </div>
  );
}
