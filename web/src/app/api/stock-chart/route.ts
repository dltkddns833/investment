import { NextResponse, type NextRequest } from "next/server";

export const runtime = "edge";

const VALID_RANGES = ["1mo", "3mo", "6mo", "1y", "max"] as const;

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  const range = request.nextUrl.searchParams.get("range") ?? "3mo";

  if (!ticker) {
    return NextResponse.json({ error: "ticker required" }, { status: 400 });
  }
  if (!VALID_RANGES.includes(range as (typeof VALID_RANGES)[number])) {
    return NextResponse.json({ error: "invalid range" }, { status: 400 });
  }

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(
        `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!res.ok) {
        if (attempt < maxRetries) continue;
        return NextResponse.json(
          { error: "Yahoo Finance error" },
          { status: 502 }
        );
      }

      const json = await res.json();
      const result = json.chart?.result?.[0];
      if (!result) {
        return NextResponse.json({ error: "no data" }, { status: 404 });
      }

      const timestamps: number[] = result.timestamp ?? [];
      const quote = result.indicators?.quote?.[0];
      if (!quote) {
        return NextResponse.json({ error: "no quote data" }, { status: 404 });
      }

      const data = timestamps.map((ts: number, i: number) => ({
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        open: Math.round(quote.open?.[i] ?? 0),
        high: Math.round(quote.high?.[i] ?? 0),
        low: Math.round(quote.low?.[i] ?? 0),
        close: Math.round(quote.close?.[i] ?? 0),
        volume: quote.volume?.[i] ?? 0,
      })).filter((d) => d.close > 0);

      return NextResponse.json({ data }, {
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
      });
    } catch {
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      return NextResponse.json(
        { error: "fetch failed" },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ error: "fetch failed" }, { status: 502 });
}
