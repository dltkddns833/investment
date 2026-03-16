export type MarketStatus = "pre" | "open" | "closed";

export function getMarketStatus(): MarketStatus {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  const day = now.getDay();
  if (day === 0 || day === 6) return "closed";
  const t = now.getHours() * 60 + now.getMinutes();
  if (t < 540) return "pre"; // < 09:00
  if (t < 930) return "open"; // < 15:30
  return "closed";
}

export const STATUS_CONFIG = {
  pre: {
    label: "장 시작 전",
    className:
      "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  },
  open: {
    label: "장 진행 중",
    className: "bg-green-500/10 text-green-400 border border-green-500/20",
    pulse: true,
  },
  closed: {
    label: "장 마감",
    className: "bg-gray-500/10 text-gray-400 border border-gray-500/20",
  },
} as const;
