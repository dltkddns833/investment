"use client";

import { useState, useRef, useEffect } from "react";
import type { News } from "@/lib/data";
import NewsCard from "./NewsCard";

function formatDateFull(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

// --- Mini Calendar ---

function MiniCalendar({
  currentDate,
  newsDates,
  onSelect,
  onClose,
}: {
  currentDate: string;
  newsDates: Set<string>;
  onSelect: (date: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cur = new Date(currentDate + "T00:00:00");
  const [viewYear, setViewYear] = useState(cur.getFullYear());
  const [viewMonth, setViewMonth] = useState(cur.getMonth());

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div
      ref={ref}
      className="absolute top-full mt-2 right-0 z-50 bg-gray-900 border border-white/10 rounded-xl shadow-2xl p-4 w-[280px]"
    >
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1 rounded hover:bg-white/5 text-gray-400 hover:text-white">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-medium">
          {viewYear}년 {viewMonth + 1}월
        </span>
        <button onClick={nextMonth} className="p-1 rounded hover:bg-white/5 text-gray-400 hover:text-white">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {dayNames.map((d) => (
          <div key={d} className="text-center text-[10px] text-gray-500 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7">
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
          const hasNews = newsDates.has(dateStr);
          const isSelected = dateStr === currentDate;

          return (
            <button
              key={day}
              disabled={!hasNews}
              onClick={() => { onSelect(dateStr); onClose(); }}
              className={`relative flex flex-col items-center py-1.5 rounded-lg text-sm transition-colors ${
                isSelected
                  ? "bg-blue-500/20 text-blue-300 font-medium"
                  : hasNews
                    ? "text-gray-200 hover:bg-white/5 cursor-pointer"
                    : "text-gray-700 cursor-default"
              }`}
            >
              {day}
              {hasNews && (
                <span
                  className={`absolute bottom-0.5 w-1 h-1 rounded-full ${
                    isSelected ? "bg-blue-400" : "bg-blue-500/60"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- Main Component ---

export default function NewsArchive({ allNews }: { allNews: News[] }) {
  const [idx, setIdx] = useState(0);
  const [calOpen, setCalOpen] = useState(false);

  if (allNews.length === 0) {
    return (
      <div className="glass-card p-8 text-center text-gray-500">
        수집된 뉴스가 없습니다.
      </div>
    );
  }

  const newsDates = new Set(allNews.map((n) => n.date));
  const selectedNews = allNews[idx];
  const hasPrev = idx < allNews.length - 1;
  const hasNext = idx > 0;

  const handleCalendarSelect = (date: string) => {
    const newIdx = allNews.findIndex((n) => n.date === date);
    if (newIdx !== -1) setIdx(newIdx);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">뉴스 아카이브</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{selectedNews.count}건</span>
        <div className="relative">
          <button
            onClick={() => setCalOpen(!calOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-gray-400 hover:text-blue-300 transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            날짜 선택
          </button>
          {calOpen && (
            <MiniCalendar
              currentDate={selectedNews.date}
              newsDates={newsDates}
              onSelect={handleCalendarSelect}
              onClose={() => setCalOpen(false)}
            />
          )}
        </div>
        </div>
      </div>

      {/* Date navigator */}
      <div className="glass-card px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setIdx(idx + 1)}
          disabled={!hasPrev}
          className="p-1.5 rounded-lg transition-colors disabled:opacity-20 disabled:cursor-not-allowed hover:bg-white/5 text-gray-400 hover:text-white"
          aria-label="이전 날짜"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center">
          <span className="text-lg font-bold">{formatDateFull(selectedNews.date)}</span>
        </div>
        <button
          onClick={() => setIdx(idx - 1)}
          disabled={!hasNext}
          className="p-1.5 rounded-lg transition-colors disabled:opacity-20 disabled:cursor-not-allowed hover:bg-white/5 text-gray-400 hover:text-white"
          aria-label="다음 날짜"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Articles */}
      <section className="glass-card overflow-hidden">
        <div className="p-4 space-y-2">
          {selectedNews.articles.map((article, i) => (
            <NewsCard key={i} article={article} />
          ))}
        </div>
      </section>
    </div>
  );
}
