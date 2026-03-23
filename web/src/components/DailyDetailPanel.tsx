"use client";

import { useState, useEffect } from "react";
import type { DailyStories, News, RankingEntry, InvestorDetail, MarketPrice } from "@/lib/data";
import { krw, signColor } from "@/lib/format";
import Link from "next/link";
import InvestorAvatar, { investorIdByName } from "./InvestorAvatar";
import NewsCard from "./NewsCard";

interface Props {
  selectedDate: string | null;
  hideHeader?: boolean;
}

interface DailyDetail {
  stories: DailyStories | null;
  news: News | null;
  rankings: RankingEntry[] | null;
  investorDetails: Record<string, InvestorDetail> | null;
  marketPrices: Record<string, MarketPrice> | null;
  prevRankMap: Record<string, number> | null;
}

function formatDateKR(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${dayNames[d.getDay()]})`;
}

export default function DailyDetailPanel({ selectedDate, hideHeader }: Props) {
  const [data, setData] = useState<DailyDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);

  useEffect(() => {
    if (!selectedDate) {
      setData(null);
      return;
    }

    setLoading(true);
    setNewsOpen(false);
    fetch(`/api/daily-detail?date=${selectedDate}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [selectedDate]);

  if (!selectedDate) {
    return (
      <div className="glass-card p-6 text-center text-gray-500 text-sm">
        달력의 날짜를 클릭하면 코멘터리, 뉴스, 투자자 일기를 확인할 수 있습니다.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="glass-card p-5 h-32 bg-white/[0.02]" />
        <div className="glass-card p-5 h-20 bg-white/[0.02]" />
        <div className="glass-card p-5 h-48 bg-white/[0.02]" />
      </div>
    );
  }

  const hasStories = data?.stories;
  const hasNews = data?.news && data.news.articles.length > 0;
  const hasRankings = data?.rankings && data.rankings.length > 0;

  if (!hasStories && !hasNews && !hasRankings) {
    return (
      <div className="glass-card p-6 text-center text-gray-500 text-sm">
        {formatDateKR(selectedDate)}의 상세 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Date header */}
      {!hideHeader && (
        <h3 className="text-lg font-bold text-purple-300">
          {formatDateKR(selectedDate)}
        </h3>
      )}

      {/* Commentary */}
      {hasStories && data.stories!.commentary && (
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-3 section-header">마켓 코멘터리</h2>
          <p className="text-sm md:text-base text-gray-300 leading-relaxed whitespace-pre-line">
            {data.stories!.commentary}
          </p>
        </section>
      )}

      {/* Investor Rankings + Diaries + Trades */}
      {hasRankings && (
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-4 section-header">투자자 현황</h2>
          <div className="space-y-2">
            {data.rankings!.map((r) => {
              const investorId = investorIdByName(r.investor);
              const diary = data.stories?.diaries[r.investor];
              const prevRank = data.prevRankMap?.[r.investor];
              const rankDiff = prevRank != null ? prevRank - r.rank : 0;
              return (
                <Link
                  href={investorId ? `/investors/${investorId}` : "#"}
                  key={r.investor}
                  className="block p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    {/* Rank badge */}
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        r.rank === 1
                          ? "bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/40"
                          : r.rank === 2
                            ? "bg-gray-400/20 text-gray-300 ring-1 ring-gray-400/40"
                            : r.rank === 3
                              ? "bg-amber-600/20 text-amber-400 ring-1 ring-amber-600/40"
                              : "bg-white/5 text-gray-500"
                      }`}
                    >
                      {r.rank}
                    </span>
                    {/* Avatar */}
                    {investorId && (
                      <div className="shrink-0">
                        <InvestorAvatar investorId={investorId} size="sm" />
                      </div>
                    )}
                    {/* Name + Rank change */}
                    <span className="text-sm font-medium shrink-0 truncate inline-flex items-center gap-1">
                      {r.investor}
                      {rankDiff !== 0 && (
                        <span
                          className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${
                            rankDiff > 0 ? "text-red-400" : "text-blue-400"
                          }`}
                        >
                          <svg
                            className={`w-2.5 h-2.5 ${rankDiff < 0 ? "rotate-180" : ""}`}
                            viewBox="0 0 10 8"
                            fill="currentColor"
                          >
                            <path d="M5 0L10 8H0z" />
                          </svg>
                          {Math.abs(rankDiff)}
                        </span>
                      )}
                    </span>
                    {/* Spacer */}
                    <span className="flex-1" />
                    {/* Return */}
                    <span
                      className={`text-sm tabular-nums font-medium w-16 text-right shrink-0 ${signColor(r.total_return_pct)}`}
                    >
                      {r.total_return_pct > 0 ? "+" : ""}
                      {r.total_return_pct.toFixed(2)}%
                    </span>
                    {/* Total asset */}
                    <span className="text-xs tabular-nums text-gray-500 w-20 text-right shrink-0 hidden sm:inline">
                      {krw(r.total_asset)}
                    </span>
                  </div>
                  {diary && (
                    <p className="text-sm text-gray-400 leading-relaxed mt-1.5 ml-[2.125rem] italic whitespace-pre-line">
                      &ldquo;{diary}&rdquo;
                    </p>
                  )}
                  {(() => {
                    const trades = data?.investorDetails?.[r.investor]?.trades_today;
                    if (!trades || trades.length === 0) return null;
                    return (
                      <div className="mt-2 ml-[2.125rem] flex flex-wrap gap-1.5">
                        {trades.map((t, i) => (
                          <span
                            key={i}
                            className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded ${
                              t.type === "buy"
                                ? "bg-red-500/10 text-red-400/80"
                                : "bg-blue-500/10 text-blue-400/80"
                            }`}
                          >
                            <span className="font-medium">
                              {t.type === "buy" ? "매수" : "매도"}
                            </span>
                            {data?.marketPrices?.[t.ticker]?.name || t.ticker}
                            <span className="text-gray-500">{t.shares}주</span>
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* News */}
      {hasNews && (
        <section className="glass-card p-4 md:p-5 animate-in">
          <button
            onClick={() => setNewsOpen(!newsOpen)}
            className="w-full flex items-center justify-between"
          >
            <h2 className="text-lg font-bold section-header flex items-center gap-2">
              뉴스
              <span className="text-xs font-normal bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">
                {data.news!.articles.length}건
              </span>
            </h2>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${newsOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {newsOpen && (
            <div className="mt-4 space-y-3">
              {data.news!.articles.map((article, i) => (
                <NewsCard key={i} article={article} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
