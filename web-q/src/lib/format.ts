export function krw(value: number): string {
  return value.toLocaleString("ko-KR") + "원";
}

export function pct(value: number, showSign = true): string {
  const sign = showSign && value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function signColor(value: number): string {
  if (value > 0) return "text-red-400";
  if (value < 0) return "text-blue-400";
  return "text-gray-500";
}

export function formatKstTime(isoUtc: string | null): string {
  if (!isoUtc) return "-";
  const d = new Date(isoUtc);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

export function formatKstDate(isoUtc: string | null): string {
  if (!isoUtc) return "-";
  const d = new Date(isoUtc);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function todayKst(): string {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
