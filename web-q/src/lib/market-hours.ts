export const CACHE_TTL_OPEN_MS = 3 * 60 * 1000;
export const CACHE_TTL_CLOSED_MS = 10 * 60 * 1000;

function nowKst(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
}

export function checkMarketOpen(): boolean {
  const now = nowKst();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  return t >= 540 && t < 930;
}

export function canFetchPrices(): boolean {
  const now = nowKst();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  return t >= 540;
}
