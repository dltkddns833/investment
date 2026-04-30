"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { QDiaryEntry } from "@/lib/q-data";

interface Props {
  entries: QDiaryEntry[];
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function formatDateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  if (isNaN(d.getTime())) return date;
  const weekday = WEEKDAY[d.getDay()];
  return `${date} (${weekday})`;
}

function DiaryCard({
  entry,
  defaultOpen,
}: {
  entry: QDiaryEntry;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-l-2 border-amber-400/40 pl-3 sm:pl-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-1.5">
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
          )}
          <span className="text-xs font-medium text-amber-200/80">
            {formatDateLabel(entry.date)}
          </span>
        </div>
        {!open && (
          <span className="text-[11px] text-gray-500 truncate max-w-[60%] ml-2">
            {entry.diary.split("\n")[0]}
          </span>
        )}
      </button>
      {open && (
        <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line mt-2">
          {entry.diary}
        </p>
      )}
    </div>
  );
}

export default function QDiaryTimeline({ entries }: Props) {
  const [showAll, setShowAll] = useState(false);

  if (entries.length === 0) {
    return <p className="text-gray-500 text-sm">아직 작성된 일기가 없습니다.</p>;
  }

  const visible = showAll ? entries : entries.slice(0, 5);

  return (
    <div className="space-y-4">
      {visible.map((entry, i) => (
        <DiaryCard
          key={entry.date}
          entry={entry}
          defaultOpen={i === 0}
        />
      ))}
      {entries.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors w-full text-center py-2"
        >
          {showAll ? "접기" : `이전 ${entries.length - 5}일 더 보기`}
        </button>
      )}
    </div>
  );
}
