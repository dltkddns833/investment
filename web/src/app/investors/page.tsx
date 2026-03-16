import {
  getConfig,
  getLatestReportDate,
  getDailyReport,
  getProfile,
} from "@/lib/data";
import InvestorGrid from "@/components/InvestorGrid";
import { getMarketStatus, STATUS_CONFIG } from "@/lib/market-status";

export const dynamic = "force-dynamic";

export default async function InvestorsPage() {
  const [config, latestDate] = await Promise.all([
    getConfig(),
    getLatestReportDate(),
  ]);

  const report = latestDate ? await getDailyReport(latestDate) : null;

  const profiles = await Promise.all(
    config.investors.map(async (inv) => {
      const profile = await getProfile(inv.id);
      return {
        id: inv.id,
        name: inv.name,
        strategy: profile?.strategy ?? "—",
        riskGrade: profile?.risk_grade ?? "",
      };
    })
  );

  const status = getMarketStatus();
  const statusCfg = STATUS_CONFIG[status];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold inline-flex items-center gap-2.5">
          투자자
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full align-middle ${statusCfg.className}`}
          >
            {"pulse" in statusCfg && statusCfg.pulse && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
              </span>
            )}
            {statusCfg.label}
          </span>
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {profiles.length}명 · {latestDate ?? "—"} 기준
        </p>
      </div>

      <InvestorGrid
        investors={profiles}
        rankings={report?.rankings ?? []}
        investorDetails={report?.investor_details ?? {}}
        initialCapital={config.simulation.initial_capital}
      />
    </div>
  );
}
