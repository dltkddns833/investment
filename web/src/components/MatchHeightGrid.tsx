"use client";

import { useRef, useEffect, ReactNode } from "react";

interface Props {
  left: ReactNode;
  right: ReactNode;
  className?: string;
}

export default function MatchHeightGrid({ left, right, className = "" }: Props) {
  const rightRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rightEl = rightRef.current;
    const leftEl = leftRef.current;
    if (!rightEl || !leftEl) return;

    const update = () => {
      if (window.innerWidth >= 1024) {
        const h = rightEl.offsetHeight;
        leftEl.style.height = `${h}px`;
      } else {
        leftEl.style.height = "";
      }
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(rightEl);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 lg:items-start ${className}`}>
      <div ref={leftRef} className="glass-card overflow-hidden animate-in rounded-xl">
        {left}
      </div>
      <div ref={rightRef}>
        {right}
      </div>
    </div>
  );
}
