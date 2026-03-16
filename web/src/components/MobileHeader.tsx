"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoIcon from "./LogoIcon";
import {
  LayoutDashboard,
  Users,
  Swords,
  TrendingUp,
  PieChart,
  BarChart2,
} from "lucide-react";

interface Investor {
  id: string;
  name: string;
}

function MobileNavLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
        active
          ? "nav-active text-white font-medium"
          : "text-gray-400 hover:bg-white/5 hover:text-gray-100"
      }`}
    >
      <span
        className={`shrink-0 transition-colors duration-200 ${
          active ? "text-blue-400" : "text-gray-500 group-hover:text-gray-300"
        }`}
      >
        {icon}
      </span>
      {label}
    </Link>
  );
}

export default function MobileHeader({
  investors: _investors,
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
      <header className="sticky top-0 z-40 flex items-center justify-between bg-gray-900/80 backdrop-blur-xl border-b border-white/5 shadow-lg px-4 h-14">
        <Link
          href="/"
          className="flex items-center gap-2"
        >
          <LogoIcon size={24} />
          <span className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            모의 투자
          </span>
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
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <nav className="fixed top-0 right-0 z-50 w-56 sm:w-64 h-full bg-gray-900/95 backdrop-blur-xl border-l border-white/5 p-4 space-y-1">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <LogoIcon size={24} />
                <span className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  모의 투자
                </span>
              </div>
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

            {/* 메인 */}
            <MobileNavLink href="/" label="대시보드" icon={<LayoutDashboard size={15} />} active={pathname === "/"} />

            <div className="my-2 border-t border-white/5" />
            <p className="px-3 pb-1 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">투자자</p>
            <MobileNavLink href="/investors" label="투자자" icon={<Users size={15} />} active={pathname.startsWith("/investors")} />
            <MobileNavLink href="/versus" label="대결" icon={<Swords size={15} />} active={pathname.startsWith("/versus")} />

            <div className="my-2 border-t border-white/5" />
            <p className="px-3 pb-1 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">데이터</p>
            <MobileNavLink href="/stocks" label="종목 분석" icon={<TrendingUp size={15} />} active={pathname.startsWith("/stocks")} />
            <MobileNavLink href="/analysis" label="분석" icon={<PieChart size={15} />} active={pathname === "/analysis"} />
            <MobileNavLink href="/reports" label="리포트" icon={<BarChart2 size={15} />} active={pathname === "/reports"} />
          </nav>
        </>
      )}
    </div>
  );
}
