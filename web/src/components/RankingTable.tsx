"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { RankingEntry, InvestorDetail } from "@/lib/data";
import { krw, pct } from "@/lib/format";
import { useLiveRankings } from "@/lib/use-live-portfolio";
import DataTable from "./DataTable";
import InvestorAvatar from "./InvestorAvatar";

const RISK_GRADE_STYLE: Record<string, string> = {
  "안정형":    "bg-blue-500/15 text-blue-300",
  "안정추구형": "bg-lime-500/15 text-lime-300",
  "위험중립형": "bg-green-500/15 text-green-300",
  "적극투자형": "bg-yellow-500/15 text-yellow-300",
  "공격투자형": "bg-red-500/15 text-red-300",
};

interface Props {
  rankings: RankingEntry[];
  investorIds: Record<string, string>;
  investorDetails?: Record<string, InvestorDetail>;
  initialCapital?: number;
  riskGrades?: Record<string, string>;
  prevRankMap?: Record<string, number> | null;
}

function rankClass(rank: number): string {
  if (rank === 1) return "rank-badge rank-1";
  if (rank === 2) return "rank-badge rank-2";
  if (rank === 3) return "rank-badge rank-3";
  return "rank-badge bg-gray-700 text-gray-300";
}

const col = createColumnHelper<RankingEntry & { _investorId: string; _riskGrade: string; _rankDiff: number }>();

function RankDiffIcon({ diff }: { diff: number }) {
  if (diff === 0) return null;
  const isUp = diff > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${
        isUp ? "text-red-400" : "text-blue-400"
      }`}
    >
      <svg
        className={`w-2.5 h-2.5 ${!isUp ? "rotate-180" : ""}`}
        viewBox="0 0 10 8"
        fill="currentColor"
      >
        <path d="M5 0L10 8H0z" />
      </svg>
      {Math.abs(diff)}
    </span>
  );
}

function getColumns() {
  return [
    col.accessor("rank", {
      header: "순위",
      cell: (info) => (
        <span className={rankClass(info.getValue())}>{info.getValue()}</span>
      ),
    }),
    col.accessor("investor", {
      header: "투자자",
      cell: (info) => (
        <Link
          href={`/investors/${info.row.original._investorId}`}
          className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 hover:underline font-medium transition-colors"
        >
          <InvestorAvatar investorId={info.row.original._investorId} size="sm" />
          {info.getValue()}
          <RankDiffIcon diff={info.row.original._rankDiff} />
        </Link>
      ),
    }),
    col.accessor("strategy", {
      header: "전략",
      meta: { className: "hidden md:table-cell" },
      cell: (info) => (
        <span className="text-gray-400">{info.getValue()}</span>
      ),
    }),
    col.accessor("total_asset", {
      header: "총자산",
      meta: { className: "text-right" },
      cell: (info) => (
        <span className="font-mono tabular-nums">{krw(info.getValue())}</span>
      ),
    }),
    col.accessor("total_return_pct", {
      header: "수익률",
      meta: { className: "text-right" },
      cell: (info) => {
        const v = info.getValue();
        const cls =
          v > 0
            ? "bg-red-500/10 text-red-400"
            : v < 0
              ? "bg-blue-500/10 text-blue-400"
              : "bg-gray-500/10 text-gray-400";
        return (
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${cls}`}
          >
            {pct(v)}
          </span>
        );
      },
    }),
    col.accessor("num_holdings", {
      header: "종목수",
      meta: { className: "text-right hidden sm:table-cell" },
      cell: (info) => (
        <span className="tabular-nums">{info.getValue()}</span>
      ),
    }),
    col.accessor("cash_ratio", {
      header: "현금비중",
      meta: { className: "text-right hidden md:table-cell" },
      cell: (info) => (
        <span className="tabular-nums">{info.getValue()}%</span>
      ),
    }),
    col.accessor("rebalance_frequency_days", {
      header: "리밸런싱",
      meta: { className: "text-center hidden md:table-cell" },
      cell: (info) => (
        <span className="text-gray-400">{info.getValue()}일마다</span>
      ),
    }),
    col.accessor("rebalanced_today", {
      header: "오늘 실행",
      meta: { className: "text-center hidden sm:table-cell" },
      cell: (info) =>
        info.getValue() ? (
          <span className="relative flex h-2.5 w-2.5 mx-auto">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400" />
          </span>
        ) : (
          <span className="inline-flex h-2.5 w-2.5 mx-auto rounded-full bg-gray-700" />
        ),
    }),
    col.accessor("_riskGrade", {
      header: "투자성향",
      meta: { className: "text-center hidden md:table-cell" },
      cell: (info) => {
        const grade = info.getValue();
        if (!grade) return null;
        const cls = RISK_GRADE_STYLE[grade] ?? "bg-gray-500/15 text-gray-300";
        return (
          <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>
            {grade}
          </span>
        );
      },
    }),
  ];
}

export default function RankingTable({
  rankings,
  investorIds,
  investorDetails,
  initialCapital,
  riskGrades,
  prevRankMap,
}: Props) {
  const liveRankings = useLiveRankings(
    rankings,
    investorDetails ?? {},
    initialCapital ?? 5_000_000
  );

  // 순위 변동 추적
  const prevRanksRef = useRef<Record<string, number>>({});
  const [rankChanges, setRankChanges] = useState<Record<string, "up" | "down">>({});

  useEffect(() => {
    const prevRanks = prevRanksRef.current;
    const changes: Record<string, "up" | "down"> = {};

    for (const r of liveRankings) {
      const prev = prevRanks[r.investor];
      if (prev !== undefined && prev !== r.rank) {
        changes[r.investor] = r.rank < prev ? "up" : "down";
      }
    }

    if (Object.keys(changes).length > 0) {
      setRankChanges(changes);
      const timer = setTimeout(() => setRankChanges({}), 2000);
      return () => clearTimeout(timer);
    }

    // 현재 순위 저장
    const currentRanks: Record<string, number> = {};
    for (const r of liveRankings) currentRanks[r.investor] = r.rank;
    prevRanksRef.current = currentRanks;
  }, [liveRankings]);

  // 현재 순위도 업데이트 (changes 이후)
  useEffect(() => {
    const currentRanks: Record<string, number> = {};
    for (const r of liveRankings) currentRanks[r.investor] = r.rank;
    prevRanksRef.current = currentRanks;
  }, [liveRankings]);

  const data = liveRankings.map((r) => {
    const prev = prevRankMap?.[r.investor];
    return {
      ...r,
      _investorId: investorIds[r.investor] || "",
      _riskGrade: riskGrades?.[r.investor] ?? "",
      _rankDiff: prev != null ? prev - r.rank : 0,
    };
  });

  const rowClassName = (row: (typeof data)[number]) => {
    const change = rankChanges[row.investor];
    if (change === "up") return "animate-rank-up";
    if (change === "down") return "animate-rank-down";
    return "";
  };

  return <DataTable columns={getColumns()} data={data} rowClassName={rowClassName} />;
}
