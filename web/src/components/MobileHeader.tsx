"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface Investor {
  id: string;
  name: string;
}

export default function MobileHeader({
  investors,
}: {
  investors: Investor[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="md:hidden">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-gray-900 border-b border-gray-800 px-4 h-14">
        <Link href="/" className="text-lg font-bold">
          모의 투자
        </Link>
        <button
          onClick={() => setOpen(!open)}
          className="p-2 text-gray-300 hover:text-white"
          aria-label="메뉴 열기"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {open ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </header>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <nav className="fixed top-0 left-0 z-50 w-64 h-full bg-gray-900 border-r border-gray-800 p-4 space-y-1">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-800">
              <span className="text-lg font-bold">모의 투자</span>
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-gray-400 hover:text-white"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <Link
              href="/"
              className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                pathname === "/"
                  ? "bg-gray-800 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              대시보드
            </Link>
            <div className="pt-4 pb-2 px-3 text-xs text-gray-500 uppercase tracking-wider">
              투자자
            </div>
            {investors.map((inv) => (
              <Link
                key={inv.id}
                href={`/investors/${inv.id}`}
                className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                  pathname === `/investors/${inv.id}`
                    ? "bg-gray-800 text-white"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`}
              >
                {inv.name}
              </Link>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
