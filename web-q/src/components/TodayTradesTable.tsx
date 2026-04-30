"use client";

import { krw, pct, signColor, formatKstTime } from "@/lib/format";

export interface TodayTrade {
  buy_at: string | null;
  sell_at: string | null;
  ticker: string;
  name: string;
  buy_price: number;
  sell_price: number | null;
  shares: number;
  pnl: number | null;
  pnl_pct: number | null;
  fee: number;
  exit_reason: "win" | "loss" | "forced" | null;
  status: "open" | "closed";
}

const reasonLabel = {
  win: "익절",
  loss: "손절",
  forced: "강제청산",
} as const;

const reasonStyle = {
  win: "bg-red-500/15 text-red-300 border-red-500/30",
  loss: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  forced: "bg-gray-500/15 text-gray-300 border-gray-500/30",
} as const;

function fmtTimeShort(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export default function TodayTradesTable({ trades }: { trades: TodayTrade[] }) {
  if (trades.length === 0) {
    return (
      <div className="glass-card p-6 md:p-8 text-center text-gray-500 text-sm">
        오늘 매매 이력이 없습니다.
      </div>
    );
  }

  const sorted = [...trades].sort((a, b) => {
    const ta = new Date(a.sell_at ?? a.buy_at ?? 0).getTime();
    const tb = new Date(b.sell_at ?? b.buy_at ?? 0).getTime();
    return tb - ta;
  });

  return (
    <div className="glass-card overflow-hidden">
      <table className="w-full text-sm table-fixed">
        <thead className="bg-white/5 text-[11px] sm:text-xs text-gray-400">
          <tr>
            <th className="text-left px-2 sm:px-3 py-2.5 font-medium w-[18%]">
              시각
            </th>
            <th className="text-left px-2 sm:px-3 py-2.5 font-medium">종목</th>
            <th className="text-right px-2 sm:px-3 py-2.5 font-medium w-[22%]">
              가격
            </th>
            <th className="text-center px-1 sm:px-3 py-2.5 font-medium w-[14%]">
              결과
            </th>
            <th className="text-right px-2 sm:px-3 py-2.5 font-medium w-[20%]">
              손익
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t, idx) => (
            <tr
              key={`${t.ticker}-${t.buy_at}-${idx}`}
              className="border-t border-white/5 hover:bg-white/[0.02] align-top"
            >
              <td className="px-2 sm:px-3 py-2.5 font-mono tabular-nums text-[11px] sm:text-xs whitespace-nowrap">
                <div>{fmtTimeShort(t.buy_at)}</div>
                <div className="text-gray-500">
                  {t.status === "open" ? (
                    <span className="text-yellow-400">보유</span>
                  ) : (
                    `→ ${fmtTimeShort(t.sell_at)}`
                  )}
                </div>
              </td>
              <td className="px-2 sm:px-3 py-2.5 min-w-0">
                <div className="font-medium truncate text-xs sm:text-sm">
                  {t.name}
                </div>
                <div className="text-[10px] sm:text-xs text-gray-500 font-mono truncate">
                  {t.ticker.split(".")[0]} · {t.shares}주
                </div>
                {t.fee > 0 && (
                  <div className="text-[10px] sm:text-xs text-gray-600 font-mono">
                    수수료 {krw(Math.round(t.fee))}
                  </div>
                )}
              </td>
              <td className="px-2 sm:px-3 py-2.5 text-right tabular-nums font-mono text-[11px] sm:text-xs whitespace-nowrap">
                <div>{t.buy_price.toLocaleString()}</div>
                <div className="text-gray-500">
                  {t.sell_price !== null
                    ? `→ ${t.sell_price.toLocaleString()}`
                    : "-"}
                </div>
              </td>
              <td className="px-1 sm:px-3 py-2.5 text-center">
                {t.exit_reason ? (
                  <span
                    className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full border whitespace-nowrap ${
                      reasonStyle[t.exit_reason]
                    }`}
                  >
                    {reasonLabel[t.exit_reason]}
                  </span>
                ) : (
                  <span className="text-[10px] sm:text-xs text-yellow-400">
                    진행중
                  </span>
                )}
              </td>
              <td
                className={`px-2 sm:px-3 py-2.5 text-right tabular-nums font-medium text-xs sm:text-sm whitespace-nowrap ${
                  t.pnl !== null ? signColor(t.pnl) : ""
                }`}
              >
                {t.pnl !== null ? (
                  <>
                    <div>{krw(t.pnl)}</div>
                    {t.pnl_pct !== null && (
                      <div className="text-[10px] sm:text-xs">
                        {pct(t.pnl_pct)}
                      </div>
                    )}
                  </>
                ) : (
                  "-"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
