/**
 * KIS API 프록시 — 실전 포트폴리오 보유종목 + 잔고 조회
 *
 * KIS inquire-balance API를 호출하여 output1(보유종목)과 output2(잔고)를 반환한다.
 * 토큰은 메모리 캐시 (Vercel 함수 인스턴스 내 재사용, cold start 시 재발급).
 */
import { NextResponse } from "next/server";

const KIS_BASE = "https://openapi.koreainvestment.com:9443";
const APP_KEY = process.env.KIS_APP_KEY ?? "";
const APP_SECRET = process.env.KIS_APP_SECRET_KEY ?? "";
const ACCOUNT_NO = process.env.KIS_ACCOUNT_NO ?? ""; // "XXXXXXXX-XX"

const [CANO, ACNT_PRDT_CD] = ACCOUNT_NO.split("-");

// --- stock_universe ticker map (lazy loaded) ---
let tickerMap: Record<string, string> | null = null;

async function getTickerMap(): Promise<Record<string, string>> {
  if (tickerMap) return tickerMap;
  try {
    const { supabase } = await import("@/lib/supabase");
    const { data } = await supabase
      .from("config")
      .select("stock_universe")
      .eq("id", 1)
      .single();
    const universe: Array<{ ticker: string }> = data?.stock_universe ?? [];
    tickerMap = {};
    for (const s of universe) {
      const bare = s.ticker.split(".")[0];
      tickerMap[bare] = s.ticker;
    }
    return tickerMap;
  } catch {
    return {};
  }
}

function kisToYf(code: string, map: Record<string, string>): string {
  return map[code] ?? `${code}.KS`;
}

// --- Token management (in-memory cache) ---
let cachedToken: { token: string; expiresAt: number } | null = null;

async function ensureToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 3600_000) {
    return cachedToken.token;
  }

  const resp = await fetch(`${KIS_BASE}/oauth2/tokenP`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: APP_KEY,
      appsecret: APP_SECRET,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`KIS token error: ${resp.status}`);

  const data = await resp.json();
  const token = data.access_token as string;
  const expiresIn = Number(data.expires_in ?? 86400);
  cachedToken = { token, expiresAt: Date.now() + expiresIn * 1000 };
  return token;
}

// --- KIS API call ---

interface KISHolding {
  ticker: string;
  code: string;
  name: string;
  shares: number;
  avg_price: number;
  current_price: number;
  eval_amount: number;
  profit_pct: number;
  change_pct: number;
}

interface KISPortfolio {
  cash: number;
  total_eval: number;
  total_asset: number;
  holdings: KISHolding[];
  fetchedAt: string;
}

async function fetchKISPortfolio(): Promise<KISPortfolio> {
  const token = await ensureToken();
  const tMap = await getTickerMap();

  const url = new URL(
    `${KIS_BASE}/uapi/domestic-stock/v1/trading/inquire-balance`
  );
  const params: Record<string, string> = {
    CANO,
    ACNT_PRDT_CD,
    AFHR_FLPR_YN: "N",
    OFL_YN: "",
    INQR_DVSN: "02",
    UNPR_DVSN: "01",
    FUND_STTL_ICLD_YN: "N",
    FNCG_AMT_AUTO_RDPT_YN: "N",
    PRCS_DVSN: "01",
    CTX_AREA_FK100: "",
    CTX_AREA_NK100: "",
  };
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const resp = await fetch(url.toString(), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: APP_KEY,
      appsecret: APP_SECRET,
      tr_id: "TTTC8434R",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) throw new Error(`KIS API error: ${resp.status}`);
  const data = await resp.json();

  if (data.rt_cd && data.rt_cd !== "0") {
    throw new Error(`KIS: ${data.msg1 ?? "Unknown error"}`);
  }

  // output1: 보유종목
  const holdings: KISHolding[] = [];
  for (const item of data.output1 ?? []) {
    const shares = Number(item.hldg_qty ?? 0);
    if (shares === 0) continue;
    const code = item.pdno ?? "";
    const currentPrice = Number(item.prpr ?? 0);
    const prevClose = Number(item.bfdy_cprs_icdc ?? 0);
    holdings.push({
      ticker: kisToYf(code, tMap),
      code,
      name: item.prdt_name ?? "",
      shares,
      avg_price: Math.round(Number(item.pchs_avg_pric ?? 0)),
      current_price: currentPrice,
      eval_amount: Number(item.evlu_amt ?? 0),
      profit_pct: Number(item.evlu_pfls_rt ?? 0),
      change_pct:
        prevClose !== 0 && currentPrice !== 0
          ? Number(item.prdy_ctrt ?? 0)
          : 0,
    });
  }

  // output2: 잔고 요약
  const o2 = (data.output2 ?? [{}])[0];

  return {
    cash: Number(o2.dnca_tot_amt ?? 0),
    total_eval: Number(o2.scts_evlu_amt ?? 0),
    total_asset: Number(o2.tot_evlu_amt ?? 0),
    holdings,
    fetchedAt: new Date().toISOString(),
  };
}

// --- Route handler ---

export async function GET() {
  if (!APP_KEY || !APP_SECRET || !ACCOUNT_NO) {
    return NextResponse.json(
      { error: "KIS credentials not configured" },
      { status: 500 }
    );
  }

  try {
    const portfolio = await fetchKISPortfolio();
    return NextResponse.json(portfolio);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[kis-portfolio]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
