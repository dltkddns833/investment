import {
  getProfile,
  getPortfolio,
  getLatestReportDate,
  getDailyReport,
  getDailyStories,
  getBadges,
  getLeagueStandings,
  getQTradeCycles,
  getQDailyStats,
  computeQSummaryStats,
  getConfig,
} from "@/lib/data";
import { krw } from "@/lib/format";
import InvestorAvatar from "@/components/InvestorAvatar";
import AssetChart from "@/components/AssetChart";
import QTradeStats from "@/components/QTradeStats";
import QDailyBar from "@/components/QDailyBar";
import QTradeTimeline from "@/components/QTradeTimeline";
import QStockPool from "@/components/QStockPool";
import { getMethodology } from "@/lib/methodology";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface Props {
  id: string;
}

export default async function QInvestorPage({ id }: Props) {
  const [profile, portfolio, latestDate, config, cycles, dailyStats] = await Promise.all([
    getProfile(id),
    getPortfolio(id),
    getLatestReportDate(),
    getConfig(),
    getQTradeCycles(),
    getQDailyStats(),
  ]);

  if (!profile || !portfolio) {
    return <div><p className="text-gray-400">투자자를 찾을 수 없습니다.</p></div>;
  }

  const [report, stories, allBadges, leagueSeason] = await Promise.all([
    latestDate ? getDailyReport(latestDate) : null,
    latestDate ? getDailyStories(latestDate) : null,
    getBadges(),
    getLeagueStandings(),
  ]);

  const investorBadges = allBadges.filter((b) => b.investor === profile.name);
  const detail = report?.investor_details[profile.name];
  const diary = stories?.diaries?.[profile.name];
  const methodology = getMethodology(id);

  const stats = computeQSummaryStats(cycles);

  // Asset curve from daily stats
  const assetHistory = dailyStats
    .filter((d) => d.total_asset > 0)
    .map((d) => ({ date: d.date, total_asset: d.total_asset }));

  const totalAsset = detail?.total_asset ?? portfolio.cash;
  const totalReturn = totalAsset - portfolio.initial_capital;
  const totalReturnPct = (totalReturn / portfolio.initial_capital) * 100;

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Back */}
      <Link
        href="/investors"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-300 transition-colors -ml-1"
      >
        <ChevronLeft className="w-4 h-4" />
        투자자 목록
      </Link>

      {/* Header Hero — 스캘핑 테마 (노란색) */}
      <div className="animate-in rounded-2xl bg-gradient-to-br from-yellow-500/10 via-orange-500/5 to-transparent p-4 md:p-6 lg:p-8 border border-yellow-500/10">
        <div className="flex items-center gap-3 md:gap-4">
          <InvestorAvatar investorId={id} size="lg" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">{profile.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <p className="text-gray-400">{profile.strategy}</p>
              {profile.risk_grade && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-500/15 text-red-300">
                  {profile.risk_grade}
                </span>
              )}
              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-300 border border-yellow-500/20">
                ⚡ 초단타 스캘퍼
              </span>
            </div>
          </div>
        </div>
        <p className="text-gray-500 text-sm mt-3 whitespace-pre-line leading-relaxed">{profile.description}</p>

        {/* Quick stats in hero */}
        <div className="flex gap-4 mt-4 pt-4 border-t border-white/5 flex-wrap">
          <div>
            <p className="text-xs text-gray-600">총자산</p>
            <p className="text-base font-bold font-mono text-gray-200">{krw(totalAsset)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600">누적 수익률</p>
            <p className={`text-base font-bold font-mono ${totalReturn >= 0 ? "text-red-400" : "text-blue-400"}`}>
              {totalReturnPct >= 0 ? "+" : ""}{totalReturnPct.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600">매매 방식</p>
            <p className="text-base font-bold text-yellow-400">1분 상시 스캔</p>
          </div>
          <div>
            <p className="text-xs text-gray-600">청산 규칙</p>
            <p className="text-base font-bold text-gray-300">+5% 익절 / -3% 손절 / 10분 강제</p>
          </div>
        </div>
      </div>

      {/* Badges */}
      {(investorBadges.length > 0 || leagueSeason) && (
        <div className="flex flex-wrap items-center gap-2 animate-in">
          {investorBadges.map((badge, i) => (
            <div
              key={i}
              className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${
                ({
                  first_profit: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                  asset_6m: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                  asset_7m: "bg-purple-500/10 text-purple-400 border-purple-500/20",
                  streak_3: "bg-red-500/10 text-red-400 border-red-500/20",
                  streak_5: "bg-orange-500/10 text-orange-400 border-orange-500/20",
                  season_champion: "bg-yellow-500/10 text-yellow-300 border-yellow-500/20",
                } as Record<string, string>)[badge.type] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20"
              }`}
              title={`${badge.description} (${badge.date})`}
            >
              <span>{{ first_profit: "★", asset_6m: "◆", asset_7m: "◇", streak_3: "▲", streak_5: "▲▲", season_champion: "🏆" }[badge.type] ?? "●"}</span>
              <span>{badge.description}</span>
            </div>
          ))}
          {leagueSeason && (() => {
            const standing = leagueSeason.standings.find((s) => s.investorId === id);
            if (!standing) return null;
            return (
              <a href="/league" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border bg-yellow-500/10 text-yellow-300 border-yellow-500/20 hover:bg-yellow-500/20 transition-colors">
                <span>🏆</span>
                <span>{leagueSeason.seasonName} {standing.rank}위 · {standing.points}점</span>
              </a>
            );
          })()}
        </div>
      )}

      {/* Diary */}
      {diary && (
        <section className="glass-card animate-in p-4 md:p-5 border-l-2 border-l-yellow-400/50">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-bold text-yellow-300">오늘의 일기</h2>
            <span className="text-xs text-gray-500">{latestDate}</span>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed italic whitespace-pre-line">
            &ldquo;{diary}&rdquo;
          </p>
        </section>
      )}

      {/* 운영 전략 정보 패널 */}
      <section className="glass-card p-4 md:p-5 animate-in">
        <h2 className="text-lg font-bold mb-3 section-header">⚡ 스캘핑 운영 규칙</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: "스캔 시간", value: "09:00 ~ 15:10 (1분 간격)", icon: "🕐" },
            { label: "진입 조건", value: "전일 종가 +10~15% 밴드 + 1시간 거래량 폭증", icon: "📊" },
            { label: "익절", value: "+5% 달성 시 즉시 매도", icon: "✅" },
            { label: "손절", value: "-3% 도달 시 즉시 매도", icon: "🛑" },
            { label: "강제청산", value: "매수 후 10분 경과 시 무조건 청산", icon: "⏱" },
            { label: "동시 보유", value: "1종목 고정 (비보유 중 상시 스캔)", icon: "🎯" },
            { label: "당일 재매수", value: "당일 체결 종목 재진입 금지", icon: "🚫" },
            { label: "종목 범위", value: "전체 KOSPI + KOSDAQ (universe 무관)", icon: "🌐" },
          ].map((item) => (
            <div key={item.label} className="flex items-start gap-2 p-2.5 bg-white/3 rounded-lg">
              <span className="text-base shrink-0">{item.icon}</span>
              <div>
                <p className="text-xs text-gray-500">{item.label}</p>
                <p className="text-sm text-gray-200">{item.value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 트레이드 사이클 통계 */}
      {stats.total_trades > 0 && (
        <section className="animate-in">
          <h2 className="text-lg font-bold mb-3 section-header">📊 트레이드 통계</h2>
          <QTradeStats stats={stats} initialCapital={portfolio.initial_capital} />
        </section>
      )}

      {/* 트레이드 타임라인 */}
      {cycles.length > 0 && (
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-3 section-header">🕐 트레이드 이력</h2>
          <p className="text-xs text-gray-500 mb-3">최근 날짜 순. 익절(빨강) / 손절(파랑) / 강제청산(회색)</p>
          <QTradeTimeline cycles={cycles} />
        </section>
      )}

      {/* 일별 매매 결과 분포 */}
      {dailyStats.some((d) => d.trade_count > 0) && (
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-3 section-header">📅 일별 매매 결과</h2>
          <p className="text-xs text-gray-500 mb-3">매매가 발생한 날의 익절/손절/강제청산 분포</p>
          <QDailyBar data={dailyStats} />
        </section>
      )}

      {/* 종목 풀 분석 */}
      {cycles.length > 0 && (
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-3 section-header">🏷️ 종목 풀 분석</h2>
          <QStockPool stats={stats} />
        </section>
      )}

      {/* 자산 추이 */}
      {assetHistory.length >= 1 && (
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-3 section-header">📈 자산 추이</h2>
          <AssetChart data={assetHistory} initialCapital={portfolio.initial_capital} />
        </section>
      )}

      {/* 방법론 */}
      {methodology && (
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-4 section-header">투자 방법론</h2>
          <div className="space-y-3">
            <div>
              <span className="text-xs text-gray-500">방법론</span>
              <p className="text-sm text-blue-300 font-medium mt-0.5">{methodology.method}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500">대표 인물</span>
              <p className="text-sm text-gray-300 mt-0.5">{methodology.representative}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500">핵심 원리</span>
              <p className="text-sm text-gray-300 mt-0.5 leading-relaxed">{methodology.core}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500">학술 / 실증 근거</span>
              <p className="text-sm text-gray-400 mt-0.5 leading-relaxed">{methodology.evidence}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500">유사 전략</span>
              <p className="text-sm text-purple-300/80 mt-0.5">{methodology.similar}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500">참고 자료</span>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {methodology.links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400 hover:text-blue-300 hover:border-blue-400/30 transition-colors"
                  >
                    <span>{link.label}</span>
                    <svg className="w-3 h-3 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 분석 기준 */}
      <section className="glass-card p-4 md:p-5 animate-in">
        <h2 className="text-lg font-bold mb-3 section-header">분석 기준</h2>
        <div className="flex flex-wrap gap-2">
          {profile.analysis_criteria.map((c, i) => (
            <span key={i} className="badge-glow text-xs px-3 py-1 rounded-full">{c}</span>
          ))}
        </div>
      </section>
    </div>
  );
}
