import { supabase } from "./supabase";

const KIS_BASE = "https://openapi.koreainvestment.com:9443";
const APP_KEY = process.env.KIS_APP_KEY ?? "";
const APP_SECRET = process.env.KIS_APP_SECRET_KEY ?? "";

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getKisToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 3600_000) {
    return cachedToken.token;
  }

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
    throw new Error("KIS 토큰이 없거나 만료됨. Python broker_client 실행 필요.");
  }

  cachedToken = {
    token: tokenData.access_token,
    expiresAt: tokenData.expires_at * 1000,
  };
  return cachedToken.token;
}

export interface KisCurrentPrice {
  code: string;
  price: number;
  change_pct: number;
  fetchedAt: string;
}

export async function fetchCurrentPrice(code: string): Promise<KisCurrentPrice> {
  const token = await getKisToken();

  const url = new URL(
    `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-price`
  );
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
  url.searchParams.set("FID_INPUT_ISCD", code);

  const resp = await fetch(url.toString(), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: APP_KEY,
      appsecret: APP_SECRET,
      tr_id: "FHKST01010100",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) throw new Error(`KIS API error: ${resp.status}`);
  const data = await resp.json();

  if (data.rt_cd && data.rt_cd !== "0") {
    throw new Error(`KIS: ${data.msg1 ?? "Unknown error"}`);
  }

  const out = data.output ?? {};
  return {
    code,
    price: Number(out.stck_prpr ?? 0),
    change_pct: Number(out.prdy_ctrt ?? 0),
    fetchedAt: new Date().toISOString(),
  };
}
