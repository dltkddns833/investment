import { NextRequest, NextResponse } from "next/server";
import { getDailyStories, getNews, getDailyReport } from "@/lib/data";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "date query parameter required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const [stories, news, report] = await Promise.all([
    getDailyStories(date),
    getNews(date),
    getDailyReport(date),
  ]);

  // Fetch previous day's rankings for rank change calculation
  let prevRankMap: Record<string, number> | null = null;
  let prevAssetMap: Record<string, number> = {};
  if (report?.rankings) {
    const { data: prevReport } = await supabase
      .from("daily_reports")
      .select("rankings")
      .lt("date", date)
      .order("date", { ascending: false })
      .limit(1)
      .single();

    if (prevReport?.rankings) {
      prevRankMap = {};
      for (const r of prevReport.rankings as { rank: number; investor: string; total_asset: number }[]) {
        prevRankMap[r.investor] = r.rank;
        prevAssetMap[r.investor] = r.total_asset;
      }
    }
  }

  return NextResponse.json({
    stories,
    news,
    rankings: report?.rankings ?? null,
    investorDetails: report?.investor_details ?? null,
    marketPrices: report?.market_prices ?? null,
    prevRankMap,
    prevAssetMap,
  });
}
