import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import MobileHeader from "@/components/MobileHeader";
import { getConfig } from "@/lib/data";
import { LivePriceProvider } from "@/lib/live-prices";
import ScrollToTop from "@/components/ScrollToTop";
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
  title: "모의 투자 시뮬레이션",
  description: "한국 주식 모의 투자 시뮬레이션 대시보드",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "모의투자",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const config = await getConfig();
  const investors = config.investors.map((inv) => ({
    id: inv.id,
    name: inv.name,
  }));
  const tickers = config.stock_universe.map(
    (s: { ticker: string }) => s.ticker
  );

  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="flex min-h-screen relative">
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <MobileHeader investors={investors} />
            <div className="gradient-separator" />
            <main className="flex-1 p-4 md:p-6 lg:p-8">
              <LivePriceProvider tickers={tickers}>
                <ScrollToTop />
                {children}
              </LivePriceProvider>
            </main>
          </div>
        </div>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
