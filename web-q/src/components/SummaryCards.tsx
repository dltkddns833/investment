import { krw, pct, signColor } from "@/lib/format";

interface Props {
  todaySummary: {
    total_trades: number;
    win_count: number;
    loss_count: number;
    forced_count: number;
    pnl_amount: number;
    return_pct: number;
  };
  cumulative: {
    total_asset: number;
    cash: number;
    initial_capital: number;
    return_pct: number;
  };
}

export default function SummaryCards({ todaySummary, cumulative }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card
        label="오늘 매매"
        value={`${todaySummary.total_trades}회`}
        sub={`익 ${todaySummary.win_count} / 손 ${todaySummary.loss_count} / 강 ${todaySummary.forced_count}`}
      />
      <Card
        label="오늘 손익"
        value={krw(todaySummary.pnl_amount)}
        valueClass={signColor(todaySummary.pnl_amount)}
        sub={pct(todaySummary.return_pct)}
        subClass={signColor(todaySummary.return_pct)}
      />
      <Card
        label="누적 자산"
        value={krw(cumulative.total_asset)}
        sub={`시드 ${krw(cumulative.initial_capital)}`}
      />
      <Card
        label="누적 수익률"
        value={pct(cumulative.return_pct)}
        valueClass={signColor(cumulative.return_pct)}
        sub={`현금 ${krw(cumulative.cash)}`}
      />
    </div>
  );
}

function Card({
  label,
  value,
  valueClass,
  sub,
  subClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
  subClass?: string;
}) {
  return (
    <div className="glass-card p-3 sm:p-4">
      <div className="text-[11px] sm:text-xs text-gray-500">{label}</div>
      <div
        className={`text-base sm:text-lg md:text-xl font-bold mt-1 break-keep ${
          valueClass ?? ""
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className={`text-[11px] sm:text-xs mt-1 ${subClass ?? "text-gray-500"}`}>
          {sub}
        </div>
      )}
    </div>
  );
}
