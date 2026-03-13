import {
  getLatestReportDate,
  getDailyReport,
  getConfig,
  getNews,
  getAllAssetHistory,
  getDailyStories,
} from "@/lib/data";
import RankingTable from "@/components/RankingTable";
import AllInvestorsAssetChart from "@/components/AllInvestorsAssetChart";
import ShowMore from "@/components/ShowMore";
import LiveMarketSection from "@/components/LiveMarketSection";
import LiveSummaryCards from "@/components/LiveSummaryCards";
import LiveDateLabel from "@/components/LiveDateLabel";

export const dynamic = "force-dynamic";

type MarketStatus = "pre" | "open" | "closed";

function getMarketStatus(): MarketStatus {
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

const STATUS_CONFIG = {
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
};

export default async function Home() {
  const [config, latestDate] = await Promise.all([
    getConfig(),
    getLatestReportDate(),
  ]);

  if (!latestDate) {
    return (
      <div>
        <h1 className="text-2xl md:text-3xl font-bold mb-4">모의 투자 시뮬레이션</h1>
        <p className="text-gray-400">
          아직 리포트가 없습니다. 시뮬레이션을 먼저 실행해주세요.
        </p>
      </div>
    );
  }

  const investorNames = config.investors.map((inv) => inv.name);

  const today = new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

  const [report, todayNews, reportNews, assetHistory, stories] = await Promise.all([
    getDailyReport(latestDate).then((r) => r!),
    getNews(today),
    today !== latestDate ? getNews(latestDate) : null,
    getAllAssetHistory(investorNames),
    getDailyStories(latestDate),
  ]);
  const news = todayNews ?? reportNews;

  const investorIds: Record<string, string> = {};
  for (const inv of config.investors) {
    investorIds[inv.name] = inv.id;
  }

  const totalInvested =
    config.simulation.initial_capital * config.investors.length;
  const totalAsset = report.rankings.reduce((s, r) => s + r.total_asset, 0);

  const status = getMarketStatus();
  const statusCfg = STATUS_CONFIG[status];

  /* ── 섹션 정의 ── */

  const headerSection = (
    <div className="animate-in">
      <h1 className="text-2xl md:text-3xl font-bold inline-flex items-center gap-2.5">
        모의 투자 시뮬레이션
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
      <LiveDateLabel storedDate={report.date} />
    </div>
  );

  const summarySection = (
    <LiveSummaryCards
      totalInvested={totalInvested}
      storedTotalAsset={totalAsset}
      initialCapital={config.simulation.initial_capital}
      investorDetails={report.investor_details}
    />
  );

  const rankingsSection = (
    <section className="glass-card overflow-hidden animate-in">
      <RankingTable
        rankings={report.rankings}
        investorIds={investorIds}
        investorDetails={report.investor_details}
        initialCapital={config.simulation.initial_capital}
      />
    </section>
  );

  const commentarySection = stories?.commentary ? (
    <section className="glass-card p-4 md:p-5 animate-in">
      <h2 className="text-lg font-bold mb-3 section-header">오늘의 마켓 코멘터리</h2>
      <p className="text-sm md:text-base text-gray-300 leading-relaxed whitespace-pre-line">
        {stories.commentary}
      </p>
    </section>
  ) : null;

  const chartSection = assetHistory.length >= 1 ? (
    <section className="glass-card p-4 md:p-5 animate-in">
      <h2 className="text-lg font-bold mb-3 section-header">자산 추이</h2>
      <AllInvestorsAssetChart
        data={assetHistory}
        investorNames={investorNames}
        initialCapital={config.simulation.initial_capital}
      />
    </section>
  ) : null;

  const marketSection = (
    <LiveMarketSection
      storedPrices={report.market_prices}
      storedFetchedAt={report.generated_at}
      sectorMap={Object.fromEntries(config.stock_universe.map((s) => [s.ticker, s.sector]))}
    />
  );

  const newsArticles = news?.articles ?? [];
  const newsSection = (
    <section className="glass-card overflow-hidden animate-in order-1 lg:order-2">
      <div className="py-4 px-4 border-b border-white/5 flex items-center justify-between">
        <h2 className="text-xl font-bold section-header">
          오늘의 뉴스
          {news && (
            <span className="text-gray-400 text-sm font-normal ml-2">
              {news.count}건
            </span>
          )}
        </h2>
        {news && (
          <span className="text-xs text-gray-500">{news.date} 수집</span>
        )}
      </div>
      <ShowMore maxHeight="max-h-[380px]" remaining={newsArticles.length > 5 ? newsArticles.length - 5 : undefined}>
        <div className="p-4 md:p-5 space-y-2">
          {newsArticles.length > 0 ? (
            newsArticles.map((article, i) => (
              <div
                key={i}
                className="bg-white/[0.02] hover:bg-white/[0.05] rounded-lg p-3 transition-all duration-200 hover:-translate-y-0.5"
              >
                <div className="font-medium text-sm">{article.title}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {article.summary}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                    {article.category}
                  </span>
                  <span className="text-xs text-gray-500">
                    {article.source}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-gray-500">뉴스 없음</div>
          )}
        </div>
      </ShowMore>
    </section>
  );

  const footerSection = (
    <div>
      <div className="gradient-separator" />
      <div className="text-center text-gray-600 text-xs py-4">
        {new Date(report.generated_at).toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}{" "}
        {new Date(report.generated_at).toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })}{" "}
        기준 · 모의투자 시뮬레이션
      </div>
    </div>
  );

  /* ── 시간대별 섹션 배치 ── */

  // 장 시작 전: 뉴스 → 시장현황 → 순위표 → 자산추이 → 요약카드
  if (status === "pre") {
    return (
      <div className="space-y-6 md:space-y-8">
        {headerSection}
        {newsSection}
        {marketSection}
        {rankingsSection}
        {commentarySection}
        {chartSection}
        {summarySection}
        {footerSection}
      </div>
    );
  }

  // 장 진행 중: 뉴스+시장(그리드) → 요약카드 → 순위표 → 자산추이
  if (status === "open") {
    return (
      <div className="space-y-6 md:space-y-8">
        {headerSection}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {marketSection}
          {newsSection}
        </div>
        {summarySection}
        {rankingsSection}
        {commentarySection}
        {chartSection}
        {footerSection}
      </div>
    );
  }

  // 장 마감 후: 요약카드 → 순위표 → 자산추이 → 시장현황+뉴스(그리드)
  return (
    <div className="space-y-6 md:space-y-8">
      {headerSection}
      {summarySection}
      {rankingsSection}
      {commentarySection}
      {chartSection}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {marketSection}
        {newsSection}
      </div>
      {footerSection}
    </div>
  );
}
