"use client";

import { useState } from "react";
import Link from "next/link";
import { krw, pct, signColor } from "@/lib/format";
import type { MetaDecision } from "@/lib/data";

const REGIME_LABEL: Record<string, { text: string; color: string }> = {
  bull: { text: "강세", color: "bg-red-500/20 text-red-400" },
  neutral: { text: "중립", color: "bg-yellow-500/20 text-yellow-400" },
  bear: { text: "약세", color: "bg-blue-500/20 text-blue-400" },
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
              className="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 text-sm hover:bg-white/5 transition-colors min-w-0"
              onClick={() => setExpanded(isOpen ? null : d.date)}
            >
              <span className="text-gray-300 font-medium text-xs sm:text-sm shrink-0">{d.date.slice(5)}</span>
              <span
                className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full shrink-0 ${regime.color}`}
              >
                {regime.text}
              </span>
              {d.decision_type && DECISION_TYPE_LABEL[d.decision_type] && (
                <span
                  className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full shrink-0 ${DECISION_TYPE_LABEL[d.decision_type].color}`}
                >
                  {DECISION_TYPE_LABEL[d.decision_type].text}
                </span>
              )}
              <span className="text-gray-500 text-xs flex-1 text-left truncate min-w-0 hidden sm:inline">
                {strategies}
              </span>
              <span className="flex items-center gap-1 shrink-0 ml-auto">
                {d.approved && (
                  <span className="text-[10px] sm:text-xs text-emerald-400">승인</span>
                )}
                {d.executed && (
                  <span className="text-[10px] sm:text-xs text-blue-400">체결</span>
                )}
                <svg
                  className={`w-3.5 h-3.5 text-gray-500 transition-transform ${
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
              </span>
            </button>

            {isOpen && (
              <div className="px-3 sm:px-4 pb-4 space-y-3 border-t border-white/5">
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
                    <div className="space-y-2">
                      {d.orders.map((o, i) => (
                        <div
                          key={i}
                          className="bg-white/[0.03] rounded-lg px-3 py-2"
                        >
                          {/* 상단: 매수/매도 뱃지 + 종목명 + 수량 + 체결 */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded ${
                                o.side === "buy"
                                  ? "bg-red-500/20 text-red-400"
                                  : "bg-blue-500/20 text-blue-400"
                              }`}
                            >
                              {o.side === "buy" ? "매수" : "매도"}
                            </span>
                            <Link
                              href={`/stocks/${encodeURIComponent(o.ticker || "")}`}
                              className="text-sm text-blue-400 hover:underline font-medium"
                            >
                              {o.name || o.ticker}
                            </Link>
                            <span className="text-xs text-gray-500">{o.qty}주</span>
                            {o.status && (
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ml-auto ${
                                  o.status === "submitted"
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "bg-yellow-500/20 text-yellow-400"
                                }`}
                              >
                                {o.status === "submitted" ? "체결" : o.status}
                              </span>
                            )}
                          </div>
                          {/* 하단: 가격 정보 */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-1.5 pl-1">
                            {o.side === "sell" && o.avg_price > 0 && (
                              <div className="border-r border-white/10 pr-3">
                                <span className="text-gray-500">매입 {krw(o.avg_price)}</span>
                                <span className={`font-medium ml-1.5 ${signColor(o.profit_pct ?? 0)}`}>
                                  {pct(o.profit_pct ?? 0)}
                                </span>
                              </div>
                            )}
                            <div>
                              <span className="text-gray-400">{o.side === "sell" ? "매도" : "매수"} {o.price ? krw(o.price) : "-"}</span>
                              {o.price && o.qty && (
                                <span className="text-gray-300 font-medium ml-1.5">총 {krw(o.price * o.qty)}</span>
                              )}
                            </div>
                          </div>
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
