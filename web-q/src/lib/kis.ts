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

export interface KisMinuteBar {
  date: string;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function fetchMinuteChart(
  code: string,
  dateStr: string,
  hourStr: string
): Promise<KisMinuteBar[]> {
  const token = await getKisToken();

  const url = new URL(
    `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-time-dailychartprice`
  );
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
  url.searchParams.set("FID_INPUT_ISCD", code);
  url.searchParams.set("FID_INPUT_HOUR_1", hourStr);
  url.searchParams.set("FID_INPUT_DATE_1", dateStr);
  url.searchParams.set("FID_PW_DATA_INCU_YN", "N");
  url.searchParams.set("FID_FAKE_TICK_INCU_YN", "");

  const resp = await fetch(url.toString(), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: APP_KEY,
      appsecret: APP_SECRET,
      tr_id: "FHKST03010230",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) throw new Error(`KIS minute API error: ${resp.status}`);
  const data = await resp.json();

  if (data.rt_cd && data.rt_cd !== "0") {
    throw new Error(`KIS: ${data.msg1 ?? "Unknown error"}`);
  }

  const bars: KisMinuteBar[] = [];
  for (const item of (data.output2 ?? []) as Record<string, string>[]) {
    const time = item.stck_cntg_hour ?? "";
    if (!time) continue;
    bars.push({
      date: item.stck_bsop_date ?? dateStr,
      time,
      open: Number(item.stck_oprc ?? 0),
      high: Number(item.stck_hgpr ?? 0),
      low: Number(item.stck_lwpr ?? 0),
      close: Number(item.stck_prpr ?? 0),
      volume: Number(item.cntg_vol ?? 0),
    });
  }
  return bars;
}
