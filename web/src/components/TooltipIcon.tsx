"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";

interface Props {
  text: string;
}

export default function TooltipIcon({ text }: Props) {
  const [show, setShow] = useState(false);

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow((v) => !v)}
    >
      <HelpCircle size={13} className="text-gray-500 cursor-help" />
      {show && (
        <span className="absolute top-full right-0 mt-2 w-52 px-3 py-2 bg-gray-800 border border-white/10 rounded-lg text-[11px] text-left text-gray-300 font-normal normal-case tracking-normal leading-relaxed whitespace-normal break-keep z-50 shadow-xl pointer-events-none">
          {text}
        </span>
      )}
    </span>
  );
}
