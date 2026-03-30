/**
 * KIS API 프록시 — 실전 포트폴리오 보유종목 + 잔고 조회
 *
 * KIS inquire-balance API를 호출하여 output1(보유종목)과 output2(잔고)를 반환한다.
 * 토큰은 Supabase config.kis_token에서 읽기만 함 (Python broker_client가 발급/저장 담당).
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

// --- Token management (Supabase에서 읽기 + 메모리 캐시) ---
let cachedToken: { token: string; expiresAt: number } | null = null;

async function ensureToken(): Promise<string> {
  // 메모리 캐시 확인 (만료 1시간 전까지 유효)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 3600_000) {
    return cachedToken.token;
  }

  // Supabase config.kis_token에서 로드 (Python broker_client가 저장한 토큰)
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase
    .from("config")
    .select("kis_token")
    .eq("id", 1)
    .single();

  const tokenData = data?.kis_token as
    | { access_token: string; expires_at: number }
    | null;

  if (
    !tokenData?.access_token ||
    Date.now() > tokenData.expires_at * 1000 - 3600_000
  ) {
    throw new Error(
      "KIS 토큰이 없거나 만료됨. Python broker_client 실행 필요."
    );
  }

  cachedToken = {
    token: tokenData.access_token,
    expiresAt: tokenData.expires_at * 1000, // Python time.time()은 초 단위
  };
  return cachedToken.token;
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
    holdings.push({
      ticker: kisToYf(code, tMap),
      code,
      name: item.prdt_name ?? "",
      shares,
      avg_price: Math.round(Number(item.pchs_avg_pric ?? 0)),
      current_price: currentPrice,
      eval_amount: Number(item.evlu_amt ?? 0),
      profit_pct: Number(item.evlu_pfls_rt ?? 0),
      change_pct: Number(item.prdy_ctrt ?? 0),
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
