"use client";

import { useState } from "react";
import Link from "next/link";
import { krw } from "@/lib/format";
import type { MetaDecision } from "@/lib/data";

const REGIME_LABEL: Record<string, { text: string; color: string }> = {
  bull: { text: "Bull", color: "bg-red-500/20 text-red-400" },
  neutral: { text: "Neutral", color: "bg-yellow-500/20 text-yellow-400" },
  bear: { text: "Bear", color: "bg-blue-500/20 text-blue-400" },
};

const DECISION_TYPE_LABEL: Record<string, { text: string; color: string }> = {
  emergency_stop_loss: { text: "손절", color: "bg-red-500/20 text-red-400" },
  emergency_take_profit: { text: "익절", color: "bg-emerald-500/20 text-emerald-400" },
  skip: { text: "스킵", color: "bg-gray-500/20 text-gray-400" },
};

export default function LiveDecisionHistory({
  decisions,
}: {
  decisions: MetaDecision[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (decisions.length === 0) {
    return <p className="text-center text-gray-500 py-4">히스토리 없음</p>;
  }

  return (
    <div className="space-y-2">
      {decisions.map((d) => {
        const regime = REGIME_LABEL[d.regime] || {
          text: d.regime,
          color: "bg-gray-500/20 text-gray-400",
        };
        const isOpen = expanded === d.date;
        const strategies = d.selected_strategies
          ? Object.entries(d.selected_strategies)
              .sort(([, a], [, b]) => b - a)
              .map(([id, w]) => `${id}(${(w * 100).toFixed(0)}%)`)
              .join(", ")
          : "-";

        return (
          <div
            key={d.date}
            className="border border-white/5 rounded-lg overflow-hidden"
          >
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5 transition-colors"
              onClick={() => setExpanded(isOpen ? null : d.date)}
            >
              <span className="text-gray-300 font-medium">{d.date}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${regime.color}`}
              >
                {regime.text}
              </span>
              {d.decision_type && DECISION_TYPE_LABEL[d.decision_type] && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${DECISION_TYPE_LABEL[d.decision_type].color}`}
                >
                  {DECISION_TYPE_LABEL[d.decision_type].text}
                </span>
              )}
              <span className="text-gray-500 text-xs flex-1 text-left truncate">
                {strategies}
              </span>
              <span className="flex items-center gap-1.5">
                {d.approved && (
                  <span className="text-xs text-emerald-400">승인</span>
                )}
                {d.executed && (
                  <span className="text-xs text-blue-400">체결</span>
                )}
              </span>
              <svg
                className={`w-4 h-4 text-gray-500 transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {isOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-white/5">
                {/* 근거 */}
                {d.rationale && (
                  <div className="pt-3">
                    <p className="text-xs text-gray-400 mb-1">배분 근거</p>
                    <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                      {d.rationale}
                    </p>
                  </div>
                )}

                {/* 주문 내역 */}
                {d.orders && d.orders.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-2">주문 내역</p>
                    <div className="space-y-1">
                      {d.orders.map((o, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-xs"
                        >
                          <span
                            className={
                              o.side === "buy"
                                ? "text-red-400"
                                : "text-blue-400"
                            }
                          >
                            {o.side === "buy" ? "매수" : "매도"}
                          </span>
                          <Link
                            href={`/stocks/${encodeURIComponent(o.ticker || "")}`}
                            className="text-blue-400 hover:underline"
                          >
                            {o.name || o.ticker}
                          </Link>
                          <span className="text-gray-500">x{o.qty}</span>
                          <span className="text-gray-500">
                            @{o.price ? krw(o.price) : "-"}
                          </span>
                          {o.status && (
                            <span
                              className={`ml-auto ${
                                o.status === "submitted"
                                  ? "text-emerald-400"
                                  : "text-yellow-400"
                              }`}
                            >
                              {o.status === "submitted" ? "체결" : o.status}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 목표 배분 */}
                {d.target_allocation && (
                  <div>
                    <p className="text-xs text-gray-400 mb-2">목표 배분</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(d.target_allocation)
                        .sort(([, a], [, b]) => b - a)
                        .map(([ticker, weight]) => (
                          <Link
                            key={ticker}
                            href={`/stocks/${encodeURIComponent(ticker)}`}
                            className="text-xs bg-gray-700/50 px-2 py-1 rounded hover:bg-gray-600/50 transition-colors"
                          >
                            {ticker.replace(/\.(KS|KQ)$/, "")}{" "}
                            <span className="text-gray-400">
                              {(weight * 100).toFixed(0)}%
                            </span>
                          </Link>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
