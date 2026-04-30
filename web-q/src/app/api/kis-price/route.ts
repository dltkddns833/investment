import { NextRequest, NextResponse } from "next/server";
import { fetchCurrentPrice } from "@/lib/kis";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "ticker required" }, { status: 400 });
  }

  const code = ticker.split(".")[0];

  try {
    const result = await fetchCurrentPrice(code);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[kis-price]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
