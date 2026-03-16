"use client";

import { useState, useRef, useEffect } from "react";
import type { DailyStories } from "@/lib/data";
import InvestorAvatar, { investorIdByName } from "./InvestorAvatar";

function formatDateFull(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

// --- Mini Calendar ---

function MiniCalendar({
  currentDate,
  storyDates,
  onSelect,
  onClose,
}: {
  currentDate: string;
  storyDates: Set<string>;
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

      <div className="grid grid-cols-7 mb-1">
        {dayNames.map((d) => (
          <div key={d} className="text-center text-[10px] text-gray-500 py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
          const hasStory = storyDates.has(dateStr);
          const isSelected = dateStr === currentDate;

          return (
            <button
              key={day}
              disabled={!hasStory}
              onClick={() => { onSelect(dateStr); onClose(); }}
              className={`relative flex flex-col items-center py-1.5 rounded-lg text-sm transition-colors ${
                isSelected
                  ? "bg-purple-500/20 text-purple-300 font-medium"
                  : hasStory
                    ? "text-gray-200 hover:bg-white/5 cursor-pointer"
                    : "text-gray-700 cursor-default"
              }`}
            >
              {day}
              {hasStory && (
                <span
                  className={`absolute bottom-0.5 w-1 h-1 rounded-full ${
                    isSelected ? "bg-purple-400" : "bg-purple-500/60"
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

export default function StoryArchive({ allStories }: { allStories: DailyStories[] }) {
  const [idx, setIdx] = useState(0);
  const [calOpen, setCalOpen] = useState(false);

  if (allStories.length === 0) {
    return (
      <div className="glass-card p-8 text-center text-gray-500">
        작성된 이야기가 없습니다.
      </div>
    );
  }

  const storyDates = new Set(allStories.map((s) => s.date));
  const selected = allStories[idx];
  const hasPrev = idx < allStories.length - 1;
  const hasNext = idx > 0;

  const handleCalendarSelect = (date: string) => {
    const newIdx = allStories.findIndex((s) => s.date === date);
    if (newIdx !== -1) setIdx(newIdx);
  };

  const diaryEntries = Object.entries(selected.diaries ?? {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">이야기 아카이브</h1>
        <div className="relative">
          <button
            onClick={() => setCalOpen(!calOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-gray-400 hover:text-purple-300 transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            날짜 선택
          </button>
          {calOpen && (
            <MiniCalendar
              currentDate={selected.date}
              storyDates={storyDates}
              onSelect={handleCalendarSelect}
              onClose={() => setCalOpen(false)}
            />
          )}
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
          <span className="text-lg font-bold">{formatDateFull(selected.date)}</span>
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

      {/* Commentary */}
      {selected.commentary && (
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-3 section-header">마켓 코멘터리</h2>
          <p className="text-sm md:text-base text-gray-300 leading-relaxed whitespace-pre-line">
            {selected.commentary}
          </p>
        </section>
      )}

      {/* Diaries */}
      {diaryEntries.length > 0 && (
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-4 section-header">투자자 일기</h2>
          <div className="space-y-3">
            {diaryEntries.map(([name, diary]) => {
              const investorId = investorIdByName(name);
              return (
                <div
                  key={name}
                  className="flex gap-3 p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
                >
                  {investorId && (
                    <div className="shrink-0 mt-0.5">
                      <InvestorAvatar investorId={investorId} size="sm" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-purple-300">{name}</span>
                    <p className="text-sm text-gray-400 leading-relaxed mt-1 italic whitespace-pre-line">
                      &ldquo;{diary}&rdquo;
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
