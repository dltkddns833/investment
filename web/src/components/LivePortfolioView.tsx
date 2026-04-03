"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { krw, pct, signColor } from "@/lib/format";
import type { RealPortfolioEntry, MetaDecision } from "@/lib/data";
import LiveAssetChart from "./LiveAssetChart";
import LiveDecisionHistory from "./LiveDecisionHistory";
import TooltipIcon from "./TooltipIcon";

interface HoldingEntry {
  ticker: string;
  name: string;
  shares: number;
  avg_price: number;
  sector: string;
  acquired_date?: string | null;
}

interface Props {
  portfolio: RealPortfolioEntry;
  history: RealPortfolioEntry[];
  decisions: MetaDecision[];
  holdings: HoldingEntry[];
  initialCapital: number;
}

// --- KIS 포트폴리오 데이터 타입 ---
interface KISHolding {
  ticker: string;
  code: string;
  name: string;
  shares: number;
  avg_price: number;
  current_price: number;
  eval_amount: number;
  profit_pct: number;
  change_pct: number;
}

interface KISPortfolio {
  cash: number;
  total_eval: number;
  total_asset: number;
  holdings: KISHolding[];
  fetchedAt: string;
}

// --- 장 상태 체크 ---
function checkMarketOpen(): boolean {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  return t >= 540 && t < 930; // 09:00 ~ 15:30
}

function canFetchPrices(): boolean {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  return t >= 540; // 09:00+
}

const CACHE_TTL_OPEN_MS = 3 * 60 * 1000; // 3분 (장중)
const CACHE_TTL_CLOSED_MS = 10 * 60 * 1000; // 10분 (장마감 후)

export default function LivePortfolioView({
  portfolio,
  history,
  decisions,
  holdings,
  initialCapital,
}: Props) {
  const [kisData, setKisData] = useState<KISPortfolio | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMarketOpen, setIsMarketOpen] = useState(false);
  const [canFetch, setCanFetch] = useState(false);
  const lastFetchRef = useRef(0);

  // 장 상태 체크
  useEffect(() => {
    setIsMarketOpen(checkMarketOpen());
    setCanFetch(canFetchPrices());
    const interval = setInterval(() => {
      setIsMarketOpen(checkMarketOpen());
      setCanFetch(canFetchPrices());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // KIS API fetch
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/kis-portfolio");
      if (!res.ok) return;
      const data: KISPortfolio = await res.json();
      if (data.holdings) {
        setKisData(data);
        lastFetchRef.current = Date.now();
      }
    } catch {
      // 실패 시 이전 데이터 유지
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // 자동 폴링
  useEffect(() => {
    if (!canFetch) return;
    const age = Date.now() - lastFetchRef.current;
    const ttl = isMarketOpen ? CACHE_TTL_OPEN_MS : CACHE_TTL_CLOSED_MS;
    if (age >= ttl) refresh();

    const interval = setInterval(() => {
      const currentTtl = checkMarketOpen() ? CACHE_TTL_OPEN_MS : CACHE_TTL_CLOSED_MS;
      if (Date.now() - lastFetchRef.current >= currentTtl) refresh();
    }, 60_000);
    return () => clearInterval(interval);
  }, [canFetch, isMarketOpen, refresh]);

  const isLive = isMarketOpen && kisData !== null;
  const isClosingPrice = !isMarketOpen && canFetch && kisData !== null;
  const hasKIS = kisData !== null;

  // KIS 데이터로 보유종목 매핑
  const kisHoldingsMap = new Map(
    kisData?.holdings.map((h) => [h.ticker, h]) ?? []
  );

  let totalEval = 0;
  const liveHoldings = holdings.map((h) => {
    const kis = kisHoldingsMap.get(h.ticker);
    const currentPrice = kis?.current_price ?? h.avg_price;
    const evalAmount = kis?.eval_amount ?? h.shares * currentPrice;
    totalEval += evalAmount;
    const profitPct = kis?.profit_pct ?? (h.avg_price > 0 ? ((currentPrice / h.avg_price - 1) * 100) : 0);
    const changePct = kis?.change_pct ?? 0;
    return {
      ...h,
      currentPrice,
      evalAmount,
      profitPct,
      changePct,
      isLivePrice: kis != null,
    };
  });

  // KIS 잔고 사용, 없으면 DB cash 직접 사용
  const cash = hasKIS ? kisData.cash : portfolio.cash;
  const totalAsset = hasKIS ? kisData.total_asset : portfolio.total_asset;
  const cumulativeReturn = ((totalAsset / initialCapital - 1) * 100);

  // 전일 자산 기준 일일 수익률
  const prevPortfolio = history.length >= 2 ? history[history.length - 2] : null;
  const prevTotalAsset = prevPortfolio?.total_asset ?? initialCapital;
  const dailyReturn = hasKIS
    ? ((totalAsset / prevTotalAsset - 1) * 100)
    : (portfolio.daily_return_pct ?? 0);

  const kospiReturn = portfolio.kospi_cumulative_pct;
  const alpha = hasKIS && kospiReturn != null
    ? cumulativeReturn - kospiReturn
    : portfolio.alpha_cumulative_pct;

  const pnl = totalAsset - initialCapital;
  const fetchedAt = kisData?.fetchedAt ?? null;

  // 라이브 뱃지
  const badge = isLive
    ? { text: "LIVE", color: "bg-red-500" }
    : isClosingPrice
    ? { text: "종가", color: "bg-blue-500" }
    : null;

  // 운용 통계 계산
  const operatingDays = history.length;
  const startDate = history.length > 0 ? history[0].date : portfolio.date;

  // MDD 계산
  let peak = initialCapital;
  let mdd = 0;
  for (const h of history) {
    if (h.total_asset > peak) peak = h.total_asset;
    const dd = (h.total_asset - peak) / peak;
    if (dd < mdd) mdd = dd;
  }

  // 최근 레짐 & 다음 리밸런싱
  const latestDecision = decisions.length > 0 ? decisions[0] : null;
  const currentRegime = latestDecision?.regime || null;
  const regimeLabel: Record<string, string> = { bull: "강세", neutral: "중립", bear: "약세" };
  const regimeMaxPct: Record<string, number> = { bull: 90, neutral: 60, bear: 30 };

  // 최근 리밸런싱 (skip이 아닌 executed)
  const lastRebalance = decisions.find(
    (d) => d.decision_type !== "skip" && d.executed
  );

  // 승률 (일일 수익률 양수인 날 / 전체)
  const dailyReturns = history.filter((h) => h.daily_return_pct != null && h.daily_return_pct !== 0);
  const winDays = dailyReturns.filter((h) => (h.daily_return_pct ?? 0) > 0).length;
  const winRate = dailyReturns.length > 0 ? (winDays / dailyReturns.length) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">실전 투자</h1>
          {badge && (
            <span className={`${badge.color} text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse`}>
              {badge.text}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-400">
          {(isLive || isClosingPrice) && fetchedAt ? (
            <>
              <span>
                {new Date(fetchedAt).toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  timeZone: "Asia/Seoul",
                })}{" "}
                {new Date(fetchedAt).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                  timeZone: "Asia/Seoul",
                })}{" "}
                기준{isClosingPrice ? " (종가)" : ""}
              </span>
              {(isMarketOpen || isClosingPrice) && (
                <button
                  onClick={refresh}
                  disabled={isRefreshing}
                  className="p-1 rounded-md hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
                  aria-label="새로고침"
                >
                  <svg
                    className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              )}
            </>
          ) : (
            <span>{portfolio.date} 기준</span>
          )}
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="총자산"
          value={krw(Math.round(totalAsset))}
          sub={pct(cumulativeReturn)}
          subColor={signColor(cumulativeReturn)}
        />
        <SummaryCard
          label="일일 수익률"
          value={pct(dailyReturn)}
          valueColor={signColor(dailyReturn)}
        />
        <SummaryCard
          label="KOSPI 누적"
          tooltip="실전 투자 시작일 대비 KOSPI 지수의 누적 수익률. 벤치마크 지표로 사용됩니다."
          value={kospiReturn != null ? pct(kospiReturn) : "-"}
          valueColor={kospiReturn != null ? signColor(kospiReturn) : "text-gray-500"}
        />
        <SummaryCard
          label="Alpha"
          tooltip="내 포트폴리오 수익률에서 KOSPI 수익률을 뺀 값. 양수면 시장을 이기고 있다는 뜻입니다."
          value={alpha != null ? pct(alpha) : "-"}
          valueColor={alpha != null ? signColor(alpha) : "text-gray-500"}
          highlight
        />
      </div>

      {/* 운용 전략 & 현재 상태 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 전략 요약 */}
        <div className="bg-gray-800/50 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-400">운용 전략</h2>
          <p className="text-xs text-gray-300 leading-relaxed">
            <span className="text-yellow-400 font-medium">목표: KOSPI 대비 초과 수익(알파 양수 유지).</span>{" "}
            15명의 시뮬레이션 투자자 성과를 종합 분석하여 최적 종목과 비중을 결정하는 AI 메타 전략입니다.
            격주 수요일 정규 리밸런싱 + 매일 긴급 손절/익절 체크로 운용됩니다.
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white/5 rounded-lg p-2.5">
              <span className="text-gray-500">리밸런싱</span>
              <p className="text-gray-300 font-medium mt-0.5">격주 수요일</p>
            </div>
            <div className="bg-white/5 rounded-lg p-2.5">
              <span className="text-gray-500">손절 기준</span>
              <p className="text-gray-300 font-medium mt-0.5">
                {currentRegime
                  ? `${({bull: "-10%", neutral: "-8%", bear: "-7%"} as Record<string, string>)[currentRegime] ?? "-8%"} (${regimeLabel[currentRegime] ?? currentRegime})`
                  : "-7~10%"
                }
              </p>
            </div>
            <div className="bg-white/5 rounded-lg p-2.5">
              <span className="text-gray-500">익절 기준</span>
              <p className="text-gray-300 font-medium mt-0.5">+10% (5일 보유 후)</p>
            </div>
            <div className="bg-white/5 rounded-lg p-2.5">
              <span className="text-gray-500">최대 투자</span>
              <p className="text-gray-300 font-medium mt-0.5">
                {currentRegime
                  ? `${regimeMaxPct[currentRegime] ?? 60}% (${regimeLabel[currentRegime] ?? currentRegime})`
                  : "레짐별 30~90%"
                }
              </p>
            </div>
          </div>
        </div>

        {/* 운용 상태 */}
        <div className="bg-gray-800/50 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-400">운용 현황</h2>
          {/* 알파 달성 상태 */}
          {alpha != null && (
            <div className={`rounded-lg p-3 text-center ${
              alpha > 0
                ? "bg-red-500/10 border border-red-500/20"
                : "bg-blue-500/10 border border-blue-500/20"
            }`}>
              <p className="text-xs text-gray-400 mb-0.5">KOSPI 대비 알파</p>
              <p className={`text-xl font-bold font-mono ${alpha > 0 ? "text-red-400" : "text-blue-400"}`}>
                {alpha > 0 ? "+" : ""}{alpha.toFixed(2)}%
              </p>
              <p className={`text-[11px] mt-0.5 ${alpha > 0 ? "text-red-500/70" : "text-blue-500/70"}`}>
                {alpha > 0 ? "시장을 이기고 있습니다" : "시장 대비 부진합니다"}
              </p>
            </div>
          )}
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">운용 기간</span>
              <span className="text-gray-200">{startDate} ~ ({operatingDays}일)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">현재 시장 국면</span>
              <span>
                {currentRegime ? (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    currentRegime === "bull" ? "bg-red-500/20 text-red-400" :
                    currentRegime === "bear" ? "bg-blue-500/20 text-blue-400" :
                    "bg-yellow-500/20 text-yellow-400"
                  }`}>
                    {regimeLabel[currentRegime] ?? currentRegime}
                  </span>
                ) : (
                  <span className="text-gray-500">-</span>
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">최근 리밸런싱</span>
              <span className="text-gray-200">{lastRebalance?.date ?? "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">승률 (일 기준)</span>
              <span className="text-gray-200">
                {dailyReturns.length > 0 ? `${winRate.toFixed(0)}% (${winDays}/${dailyReturns.length}일)` : "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">MDD</span>
              <span className={`font-medium ${mdd < -0.03 ? "text-blue-400" : "text-gray-200"}`}>
                {(mdd * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">안전 장치</span>
              <span className="text-xs text-gray-400">일일 -3% 중단 · 누적 -10% 청산</span>
            </div>
          </div>
        </div>
      </div>

      {/* 자산 추이 + 현황 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-gray-800/50 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-400 mb-4">자산 추이</h2>
          <LiveAssetChart history={history} initialCapital={initialCapital} />
        </div>
        <div className="bg-gray-800/50 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-400">포트폴리오 현황</h2>
          <div className="space-y-3">
            <InfoRow label="초기 자금" value={krw(initialCapital)} />
            <InfoRow
              label="현재 자산"
              value={krw(Math.round(totalAsset))}
              bold
            />
            <InfoRow label="현금" value={krw(cash)} />
            <InfoRow
              label="현금 비율"
              value={`${((cash / totalAsset) * 100).toFixed(1)}%`}
            />
            <div className="border-t border-white/10 pt-3">
              <InfoRow
                label="손익"
                value={`${pnl >= 0 ? "+" : ""}${krw(Math.round(pnl))}`}
                valueColor={signColor(pnl)}
                bold
              />
            </div>
          </div>
        </div>
      </div>

      {/* 보유종목 */}
      <div className="bg-gray-800/50 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 mb-4">보유종목</h2>
        <LiveHoldingsTableWithPrice holdings={liveHoldings} />
      </div>

      {/* 매매 히스토리 */}
      <div className="bg-gray-800/50 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 mb-4">매매 히스토리</h2>
        <LiveDecisionHistory decisions={decisions} />
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  tooltip,
  value,
  sub,
  valueColor,
  subColor,
  highlight,
}: {
  label: string;
  tooltip?: string;
  value: string;
  sub?: string;
  valueColor?: string;
  subColor?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 ${
        highlight
          ? "bg-gradient-to-br from-blue-900/40 to-purple-900/40 border border-blue-500/20"
          : "bg-gray-800/50"
      }`}
    >
      <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
        {label}
        {tooltip && <TooltipIcon text={tooltip} />}
      </p>
      <p className={`text-lg font-bold ${valueColor || ""}`}>{value}</p>
      {sub && (
        <p className={`text-xs mt-0.5 ${subColor || "text-gray-500"}`}>{sub}</p>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  valueColor,
  bold,
}: {
  label: string;
  value: string;
  valueColor?: string;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className={`${bold ? "font-semibold" : ""} ${valueColor || ""}`}>
        {value}
      </span>
    </div>
  );
}

type SortKey = "evalAmount" | "profitPct" | "name";

function LiveHoldingsTableWithPrice({
  holdings,
}: {
  holdings: Array<{
    ticker: string;
    name: string;
    shares: number;
    avg_price: number;
    sector: string;
    currentPrice: number;
    evalAmount: number;
    profitPct: number;
    changePct: number;
    isLivePrice: boolean;
    acquired_date?: string | null;
  }>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("evalAmount");
  const [sortAsc, setSortAsc] = useState(false);

  if (holdings.length === 0) {
    return <p className="text-center text-gray-500 py-4">보유종목 없음</p>;
  }

  const sorted = [...holdings].sort((a, b) => {
    const av = sortKey === "name" ? a.name : a[sortKey];
    const bv = sortKey === "name" ? b.name : b[sortKey];
    if (typeof av === "string" && typeof bv === "string")
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const sortIcon = (key: SortKey) =>
    sortKey === key ? (sortAsc ? " ▲" : " ▼") : "";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 text-xs border-b border-white/10">
            <th
              className="text-left pb-2 font-medium cursor-pointer hover:text-gray-200"
              onClick={() => toggleSort("name")}
            >
              종목{sortIcon("name")}
            </th>
            <th className="text-left pb-2 font-medium">섹터</th>
            <th className="text-right pb-2 font-medium">수량</th>
            <th className="text-right pb-2 font-medium">평균단가</th>
            <th className="text-right pb-2 font-medium">현재가</th>
            <th
              className="text-right pb-2 font-medium cursor-pointer hover:text-gray-200"
              onClick={() => toggleSort("evalAmount")}
            >
              평가금액{sortIcon("evalAmount")}
            </th>
            <th
              className="text-right pb-2 font-medium cursor-pointer hover:text-gray-200"
              onClick={() => toggleSort("profitPct")}
            >
              수익률{sortIcon("profitPct")}
            </th>
            <th className="text-right pb-2 font-medium">보유일</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {sorted.map((h) => (
            <tr key={h.ticker} className="hover:bg-white/5">
              <td className="py-2.5">
                <Link
                  href={`/stocks/${encodeURIComponent(h.ticker)}`}
                  className="text-blue-400 hover:underline"
                >
                  {h.name}
                </Link>
                <span className="text-gray-500 text-xs ml-1">
                  {h.ticker.replace(/\.(KS|KQ)$/, "")}
                </span>
              </td>
              <td className="py-2.5 text-gray-400">{h.sector}</td>
              <td className="py-2.5 text-right">{h.shares}주</td>
              <td className="py-2.5 text-right">{krw(h.avg_price)}</td>
              <td className="py-2.5 text-right">
                <span>{krw(h.currentPrice)}</span>
                {h.isLivePrice && h.changePct !== 0 && (
                  <span className={`text-xs ml-1 ${signColor(h.changePct)}`}>
                    {h.changePct > 0 ? "+" : ""}{h.changePct.toFixed(1)}%
                  </span>
                )}
              </td>
              <td className="py-2.5 text-right font-medium">
                {krw(Math.round(h.evalAmount))}
              </td>
              <td className={`py-2.5 text-right font-medium ${signColor(h.profitPct)}`}>
                {pct(h.profitPct)}
              </td>
              <td className="py-2.5 text-right text-gray-400 text-xs">
                {h.acquired_date ? h.acquired_date.slice(5) : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
