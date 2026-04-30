import {
  getQTradeCycles,
  getQDailyStats,
  computeQSummaryStats,
  getQDiaryHistory,
} from "@/lib/q-data";
import { krw, pct, signColor } from "@/lib/format";
import DailyPnLChart from "@/components/DailyPnLChart";
import AssetCurveChart from "@/components/AssetCurveChart";
import QTradeTimeline from "@/components/QTradeTimeline";
import QDiaryTimeline from "@/components/QDiaryTimeline";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const [cycles, daily, diaries] = await Promise.all([
    getQTradeCycles(),
    getQDailyStats(),
    getQDiaryHistory(30),
  ]);
  const stats = computeQSummaryStats(cycles);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">누적 기록</h1>
        <p className="text-sm text-gray-500 mt-1">
          {stats.trading_days}일간 {stats.total_trades}회 매매
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="총 매매" value={`${stats.total_trades}회`} />
        <Stat
          label="승률"
          value={`${stats.win_rate.toFixed(1)}%`}
          sub={`익 ${stats.win_count} / 손 ${stats.loss_count} / 강 ${stats.forced_count}`}
        />
        <Stat
          label="평균 수익률"
          value={pct(stats.avg_pnl_pct)}
          valueClass={signColor(stats.avg_pnl_pct)}
        />
        <Stat
          label="누적 손익"
          value={krw(stats.total_pnl)}
          valueClass={signColor(stats.total_pnl)}
          sub={`수수료 ${krw(stats.total_fee)}`}
        />
        <Stat
          label="평균 보유시간"
          value={`${stats.avg_holding_minutes.toFixed(1)}분`}
        />
        <Stat
          label="일평균 매매"
          value={`${stats.avg_trades_per_day.toFixed(1)}회`}
        />
        <Stat
          label="KOSPI / KOSDAQ"
          value={`${stats.kospi_count} / ${stats.kosdaq_count}`}
        />
        <Stat label="거래일" value={`${stats.trading_days}일`} />
      </div>

      <section className="glass-card p-5 md:p-6">
        <h2 className="text-base font-bold mb-3">정채원의 일기</h2>
        <QDiaryTimeline entries={diaries} />
      </section>

      <section className="glass-card p-5 md:p-6">
        <h2 className="text-base font-bold mb-3">일별 손익</h2>
        <DailyPnLChart data={daily} />
      </section>

      <section className="glass-card p-5 md:p-6">
        <h2 className="text-base font-bold mb-3">누적 자산 추이</h2>
        <AssetCurveChart data={daily} />
      </section>

      <section className="glass-card p-5 md:p-6">
        <h2 className="text-base font-bold mb-3">일별 매매 기록</h2>
        <QTradeTimeline cycles={cycles} />
      </section>

      <section className="glass-card p-5 md:p-6">
        <h2 className="text-base font-bold mb-3">매매 빈도 Top 10</h2>
        {stats.top_stocks.length === 0 ? (
          <div className="text-sm text-gray-500">데이터 없음</div>
        ) : (
          <div className="space-y-1.5">
            {stats.top_stocks.map((s) => (
              <div
                key={s.ticker}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{s.name}</span>
                  <span className="text-xs text-gray-500 font-mono">
                    {s.ticker}
                  </span>
                </div>
                <span className="text-xs text-gray-400 tabular-nums">
                  {s.count}회
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
  sub,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
}) {
  return (
    <div className="glass-card p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-bold mt-1 ${valueClass ?? ""}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}
