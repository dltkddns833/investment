"use client";

import { useState } from "react";

interface Props {
  children: React.ReactNode;
  maxHeight?: string;
  remaining?: number;
}

export default function ShowMore({
  children,
  maxHeight = "max-h-[360px]",
  remaining,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  if (expanded) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div className={`${maxHeight} md:max-h-none overflow-hidden`}>
        {children}
      </div>
      <div className="md:hidden">
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#111827] to-transparent pointer-events-none" />
        <button
          onClick={() => setExpanded(true)}
          className="relative w-full py-2.5 text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors"
        >
          더보기{remaining != null && remaining > 0 ? ` (+${remaining}건)` : ""}
        </button>
      </div>
    </div>
  );
}
