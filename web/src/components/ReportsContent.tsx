"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DailyReturn } from "@/lib/data";
import { signColor } from "@/lib/format";
import CalendarHeatmap from "./CalendarHeatmap";
import DailyDetailPanel from "./DailyDetailPanel";

interface Props {
  dailyReturns: DailyReturn[];
  year: number;
  month: number;
}

export default function ReportsContent({
  dailyReturns,
  year,
  month,
}: Props) {
  const latestDate =
    dailyReturns.length > 0
      ? dailyReturns.reduce((a, b) => (a.date > b.date ? a : b)).date
      : null;
  const [selectedDate, setSelectedDate] = useState<string | null>(latestDate);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const router = useRouter();

  const sortedDates = [...dailyReturns].sort((a, b) => b.date.localeCompare(a.date));

  function navigate(y: number, m: number) {
    const params = new URLSearchParams();
    params.set("month", `${y}-${String(m).padStart(2, "0")}`);
    router.push(`/reports?${params.toString()}`);
  }

  function prevMonth() {
    const m = month === 1 ? 12 : month - 1;
    const y = month === 1 ? year - 1 : year;
    navigate(y, m);
  }

  function nextMonth() {
    const m = month === 12 ? 1 : month + 1;
    const y = month === 12 ? year + 1 : year;
    navigate(y, m);
  }

  function handleDateClick(dateStr: string) {
    setSelectedDate(dateStr);
    setCalendarOpen(false);
  }

  function formatDateKR(dateStr: string) {
    const d = new Date(dateStr + "T00:00:00");
    const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${dayNames[d.getDay()]})`;
  }

  const monthNavigator = (
    <div className="flex items-center justify-between">
      <button
        onClick={prevMonth}
        className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <span className="text-sm font-bold">
        {year}년 {month}월
      </span>
      <button
        onClick={nextMonth}
        className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );

  const dateList = (
    <div className="space-y-0.5">
      {sortedDates.map((d) => {
        const isActive = selectedDate === d.date;
        const pct = d.return_pct;
        return (
          <button
            key={d.date}
            onClick={() => handleDateClick(d.date)}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors ${
              isActive
                ? "bg-purple-500/20 text-purple-200 border border-purple-500/30"
                : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
            }`}
          >
            <span>{formatDateKR(d.date)}</span>
            <span className={`tabular-nums text-xs font-medium ${signColor(pct)}`}>
              {pct > 0 ? "+" : ""}
              {pct.toFixed(2)}%
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      {/* ===== Desktop: side-by-side ===== */}
      <div className="hidden md:flex gap-6 animate-in" style={{ minHeight: "calc(100vh - 200px)" }}>
        {/* Left panel */}
        <div className="w-72 shrink-0 space-y-4 pl-1 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto">
          {monthNavigator}

          {dailyReturns.length > 0 ? (
            <CalendarHeatmap
              data={dailyReturns}
              year={year}
              month={month}
              onDateClick={handleDateClick}
              selectedDate={selectedDate}
            />
          ) : (
            <p className="text-gray-500 text-sm py-4 text-center">
              해당 월의 리포트가 없습니다.
            </p>
          )}

          {sortedDates.length > 0 && (
            <div className="border-t border-white/5 pt-3">
              {dateList}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="flex-1 min-w-0 overflow-y-auto space-y-4">
          {selectedDate && (
            <h3 className="text-lg font-bold text-purple-300">
              {formatDateKR(selectedDate)}
            </h3>
          )}
          <DailyDetailPanel selectedDate={selectedDate} hideHeader />
        </div>
      </div>

      {/* ===== Mobile: stacked with collapsible calendar ===== */}
      <div className="md:hidden space-y-4 animate-in">
        <button
          onClick={() => setCalendarOpen(!calendarOpen)}
          className="w-full glass-card p-3 flex items-center justify-between"
        >
          <span className="text-sm font-bold text-purple-300">
            {selectedDate ? formatDateKR(selectedDate) : `${year}년 ${month}월`}
          </span>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${calendarOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {calendarOpen && (
          <div className="glass-card p-4 space-y-4">
            {monthNavigator}
            {dailyReturns.length > 0 ? (
              <CalendarHeatmap
                data={dailyReturns}
                year={year}
                month={month}
                onDateClick={handleDateClick}
                selectedDate={selectedDate}
              />
            ) : (
              <p className="text-gray-500 text-sm py-4 text-center">
                해당 월의 리포트가 없습니다.
              </p>
            )}
            {sortedDates.length > 0 && dateList}
          </div>
        )}

        <DailyDetailPanel selectedDate={selectedDate} hideHeader />
      </div>
    </>
  );
}
