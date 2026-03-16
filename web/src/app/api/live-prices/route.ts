// 시뮬레이션 가격(과거 시가/종가)은 scripts/core/market.py 참조
import { NextResponse, type NextRequest } from "next/server";

async function fetchTicker(
  ticker: string,
  retries = 2
): Promise<{ price: number; change_pct: number } | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(
        `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (!res.ok) {
        if (attempt < retries) continue;
        return null;
      }
      const data = await res.json();
      const meta = data.chart?.result?.[0]?.meta;
      if (!meta) return null;

      const price = Math.round(meta.regularMarketPrice);
      const prevClose = Math.round(
        meta.chartPreviousClose || meta.previousClose
      );
      const change_pct =
        prevClose > 0
          ? +((((price - prevClose) / prevClose) * 100).toFixed(2))
          : 0;

      return { price, change_pct };
    } catch {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const tickersParam = request.nextUrl.searchParams.get("tickers");
  if (!tickersParam) {
    return NextResponse.json({ error: "tickers required" }, { status: 400 });
  }

  const tickers = tickersParam.split(",").slice(0, 50);
  const results = await Promise.all(
    tickers.map(async (ticker) => {
      const data = await fetchTicker(ticker);
      return [ticker, data] as const;
    })
  );

  const prices: Record<string, { price: number; change_pct: number }> = {};
  for (const [ticker, data] of results) {
    if (data) prices[ticker] = data;
  }

  return NextResponse.json({
    prices,
    fetchedAt: new Date().toISOString(),
    count: Object.keys(prices).length,
  });
}
