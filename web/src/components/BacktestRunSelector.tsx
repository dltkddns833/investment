"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BacktestRun } from "@/lib/data";
import { Loader2 } from "lucide-react";

interface Props {
  runs: BacktestRun[];
  currentRunId: string;
}

function getLabel(run: BacktestRun): string {
  const days = run.trading_days;
  if (days <= 25) return "1개월";
  if (days <= 70) return "3개월";
  if (days <= 135) return "6개월";
  if (days <= 200) return "9개월";
  return "1년";
}

export default function BacktestRunSelector({ runs, currentRunId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [clickedId, setClickedId] = useState<string | null>(null);

  function handleClick(runId: string) {
    if (runId === currentRunId) return;
    setClickedId(runId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("run", runId);
    startTransition(() => {
      router.push(`/backtest?${params.toString()}`);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex rounded-lg border border-white/10 overflow-hidden">
        {runs
          .sort((a, b) => a.trading_days - b.trading_days)
          .map((run) => {
            const isActive = run.id === currentRunId;
            const isLoading = isPending && run.id === clickedId;
            return (
              <button
                key={run.id}
                onClick={() => handleClick(run.id)}
                disabled={isPending}
                className={`px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : isLoading
                      ? "bg-blue-600/30 text-blue-300"
                      : "bg-gray-800/50 text-gray-400 hover:bg-white/5 hover:text-gray-200"
                } ${isPending ? "cursor-wait" : ""}`}
              >
                {isLoading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" />
                    {getLabel(run)}
                  </span>
                ) : (
                  getLabel(run)
                )}
              </button>
            );
          })}
      </div>
      {isPending && !clickedId && (
        <Loader2 size={16} className="animate-spin text-gray-400" />
      )}
    </div>
  );
}
