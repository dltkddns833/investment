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
