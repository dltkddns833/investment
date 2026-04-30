import { NextRequest, NextResponse } from "next/server";
import { fetchMinuteChart } from "@/lib/kis";

export const dynamic = "force-dynamic";

interface CacheEntry {
  expiresAt: number;
  data: { time: string; price: number }[];
}

const cache = new Map<string, CacheEntry>();

function kstParts(d: Date): { date: string; time: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value])
  );
  return {
    date: `${parts.year}${parts.month}${parts.day}`,
    time: `${parts.hour}${parts.minute}${parts.second}`,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker");
  const from = searchParams.get("from");
  if (!ticker || !from) {
    return NextResponse.json(
      { error: "ticker and from required" },
      { status: 400 }
    );
  }

  const code = ticker.split(".")[0];
  const buyDate = new Date(from);
  if (isNaN(buyDate.getTime())) {
    return NextResponse.json({ error: "invalid from" }, { status: 400 });
  }

  const buy = kstParts(buyDate);
  const cur = kstParts(new Date());

  // 분봉의 시작 시각 단위로 필터하기 위해 매수 시각을 분 단위로 절삭
  const buyMinute = buy.time.slice(0, 4) + "00";
  const minuteKey = cur.time.slice(0, 4);
  const cacheKey = `${code}-${buy.date}-${buyMinute}-${minuteKey}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json({ bars: cached.data });
  }

  try {
    const bars = await fetchMinuteChart(code, cur.date, cur.time);
    const filtered = bars
      .filter(
        (b) => b.date === buy.date && b.time >= buyMinute && b.close > 0
      )
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((b) => ({ time: b.time.slice(0, 4), price: b.close }));

    cache.set(cacheKey, {
      expiresAt: Date.now() + 60_000,
      data: filtered,
    });
    return NextResponse.json(
      { bars: filtered },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[kis-minute]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
