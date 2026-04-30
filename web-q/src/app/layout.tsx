import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "정채원의 작전실",
  description: "거래량 폭증 매집 추종 스캘핑 — 실시간 운영 모니터링",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/jcw-icon.svg", type: "image/svg+xml" },
      { url: "/jcw-icon-maskable.svg", type: "image/svg+xml", sizes: "any" },
    ],
    shortcut: "/jcw-icon.svg",
    apple: "/jcw-icon-maskable.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-white/5 bg-slate-900/60 backdrop-blur sticky top-0 z-10">
            <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 py-3 flex items-center justify-between gap-2 sm:gap-4">
              <Link href="/" className="flex items-center gap-2 min-w-0">
                <span className="relative shrink-0 inline-flex jcw-icon-glow">
                  <span className="absolute inset-0 -m-1 rounded-full bg-gradient-to-r from-pink-500/40 via-amber-400/40 to-purple-500/40 blur-md jcw-icon-aura" />
                  <Image
                    src="/jcw-icon.svg"
                    alt="정채원"
                    width={28}
                    height={28}
                    className="relative sm:w-8 sm:h-8"
                    priority
                  />
                </span>
                <span className="font-bold text-sm sm:text-base md:text-lg truncate bg-gradient-to-r from-pink-300 via-amber-200 to-purple-300 bg-clip-text text-transparent jcw-title-shimmer">
                  정채원의 작전실
                </span>
                <style>{`
                  .jcw-icon-glow {
                    animation: jcw-icon-bob 2.4s ease-in-out infinite;
                  }
                  .jcw-icon-aura {
                    animation: jcw-icon-pulse 1.8s ease-in-out infinite;
                  }
                  .jcw-title-shimmer {
                    background-size: 200% auto;
                    animation: jcw-title-flow 3s linear infinite;
                  }
                  @keyframes jcw-icon-bob {
                    0%, 100% { transform: translateY(0) rotate(-3deg); }
                    50% { transform: translateY(-1px) rotate(3deg); }
                  }
                  @keyframes jcw-icon-pulse {
                    0%, 100% { opacity: 0.5; transform: scale(1); }
                    50% { opacity: 1; transform: scale(1.2); }
                  }
                  @keyframes jcw-title-flow {
                    0% { background-position: 0% center; }
                    100% { background-position: 200% center; }
                  }
                `}</style>
                <span className="text-xs text-gray-500 hidden lg:inline">
                  거래량 폭증 매집 추종 스캘핑
                </span>
              </Link>
              <nav className="flex gap-0.5 sm:gap-1 text-xs sm:text-sm shrink-0">
                <Link
                  href="/"
                  className="px-2 sm:px-3 py-1.5 rounded hover:bg-white/5 transition-colors"
                >
                  오늘
                </Link>
                <Link
                  href="/history"
                  className="px-2 sm:px-3 py-1.5 rounded hover:bg-white/5 transition-colors"
                >
                  누적
                </Link>
                <Link
                  href="/strategy"
                  className="px-2 sm:px-3 py-1.5 rounded hover:bg-white/5 transition-colors"
                >
                  전략
                </Link>
              </nav>
            </div>
          </header>
          <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8">
            {children}
          </main>
        </div>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
