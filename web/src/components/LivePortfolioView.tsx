"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { krw, pct, signColor } from "@/lib/format";
import type {
  RealPortfolioEntry,
  MetaDecision,
  Allocation,
  InvestorSnapshot,
} from "@/lib/data";
import LiveAssetChart from "./LiveAssetChart";
import LiveDecisionHistory from "./LiveDecisionHistory";
import LiveFollowBanner from "./LiveFollowBanner";
import LiveTodayAllocation from "./LiveTodayAllocation";
import LiveFollowComparison from "./LiveFollowComparison";
import TooltipIcon from "./TooltipIcon";

interface HoldingEntry {
  ticker: string;
  name: string;
  shares: number;
  avg_price: number;
  sector: string;
  acquired_date?: string | null;
}

export interface FollowInfo {
  investorId: string;
  investorName: string;
  strategy: string;
  startDate: string;
  todayAllocation: Allocation | null;
  investorSnapshots: InvestorSnapshot[];
}

interface Props {
  portfolio: RealPortfolioEntry;
  history: RealPortfolioEntry[];
  decisions: MetaDecision[];
  holdings: HoldingEntry[];
  initialCapital: number;
  follow: FollowInfo | null;
  stockNameMap: Record<string, string>;
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
  follow,
  stockNameMap,
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

  // 추종 모드: follow_start_date 이후로 history 필터 + 첫 레코드 기준 재계산
  const followStartDate = follow?.startDate ?? null;
  const followHistory = followStartDate
    ? history.filter((h) => h.date >= followStartDate)
    : history;
  const baseRecord = followHistory[0] ?? history[0] ?? null;
  const effectiveInitial = baseRecord?.total_asset ?? initialCapital;
  const baseKospiPct = baseRecord?.kospi_cumulative_pct ?? null;
  const baseKospiMultiplier =
    baseKospiPct != null ? 1 + baseKospiPct / 100 : null;

  // follow 구간 내 누적 입출금 (TWR 계산용 — 입금 영향 제거)
  const baseCumulativeDeposits = baseRecord?.cumulative_deposits ?? 0;
  const latestCumulativeDeposits = portfolio.cumulative_deposits ?? 0;
  const followCumulativeDeposits = latestCumulativeDeposits - baseCumulativeDeposits;
  const todayNetDeposit = portfolio.net_deposit ?? 0;

  // 누적수익률: DB의 TWR cumulative_return_pct 값 직접 사용 (입금 영향 이미 제거됨)
  const cumulativeReturn = hasKIS
    ? (() => {
        // 실시간: 어제 cumulative + 오늘 daily 컴파운드
        const prevCum =
          followHistory.length >= 2
            ? followHistory[followHistory.length - 2].cumulative_return_pct ?? 0
            : 0;
        const todayDaily =
          ((totalAsset - todayNetDeposit) /
            (followHistory.length >= 2
              ? followHistory[followHistory.length - 2].total_asset
              : effectiveInitial) -
            1) * 100;
        return ((1 + prevCum / 100) * (1 + todayDaily / 100) - 1) * 100;
      })()
    : portfolio.cumulative_return_pct ?? 0;

  // 전일 자산 기준 일일 수익률 (입금 차감)
  const prevPortfolio =
    followHistory.length >= 2 ? followHistory[followHistory.length - 2] : null;
  const prevTotalAsset = prevPortfolio?.total_asset ?? effectiveInitial;
  const dailyReturn = hasKIS
    ? ((totalAsset - todayNetDeposit) / prevTotalAsset - 1) * 100
    : portfolio.daily_return_pct ?? 0;

  // KOSPI 누적: follow 시작일 기준으로 리베이스
  const rawKospiPct = portfolio.kospi_cumulative_pct;
  const kospiReturn =
    followStartDate && baseKospiMultiplier != null && rawKospiPct != null
      ? ((1 + rawKospiPct / 100) / baseKospiMultiplier - 1) * 100
      : rawKospiPct;
  const alpha =
    kospiReturn != null ? cumulativeReturn - kospiReturn : null;

  // 운용 손익 = 현재 자산 - 시작 자산 - 누적 입금 (입출금 영향 제거)
  const pnl = totalAsset - effectiveInitial - followCumulativeDeposits;
  const fetchedAt = kisData?.fetchedAt ?? null;

  // 라이브 뱃지
  const badge = isLive
    ? { text: "LIVE", color: "bg-red-500" }
    : isClosingPrice
    ? { text: "종가", color: "bg-blue-500" }
    : null;

  // 운용 통계 계산 (follow 구간 기준)
  const operatingDays = followHistory.length;
  const startDate =
    followStartDate ??
    (history.length > 0 ? history[0].date : portfolio.date);

  // MDD 계산 (TWR 기반 가상 자산으로 — 입금 점프 영향 제거)
  let peak = effectiveInitial;
  let mdd = 0;
  for (const h of followHistory) {
    const virtualAsset = effectiveInitial * (1 + (h.cumulative_return_pct ?? 0) / 100);
    if (virtualAsset > peak) peak = virtualAsset;
    const dd = (virtualAsset - peak) / peak;
    if (dd < mdd) mdd = dd;
  }

  // 최근 레짐 & 다음 리밸런싱
  const latestDecision = decisions.length > 0 ? decisions[0] : null;
  const currentRegime = latestDecision?.regime || null;
  const regimeLabel: Record<string, string> = { bull: "강세", neutral: "중립", bear: "약세" };

  // follow 구간 내 매매 (skip이 아닌 executed)
  const followDecisions = followStartDate
    ? decisions.filter((d) => d.date >= followStartDate)
    : decisions;
  const lastRebalance = followDecisions.find(
    (d) => d.decision_type !== "skip" && d.executed
  );

  // 승률 (follow 구간, 일일 수익률 양수인 날 / 전체)
  const dailyReturns = followHistory.filter(
    (h) => h.daily_return_pct != null && h.daily_return_pct !== 0
  );
  const winDays = dailyReturns.filter((h) => (h.daily_return_pct ?? 0) > 0).length;
  const winRate = dailyReturns.length > 0 ? (winDays / dailyReturns.length) * 100 : 0;

  // 최대 수익일 / 최대 손실일
  const bestDay = dailyReturns.length > 0
    ? dailyReturns.reduce((best, h) => (h.daily_return_pct ?? 0) > (best.daily_return_pct ?? 0) ? h : best)
    : null;
  const worstDay = dailyReturns.length > 0
    ? dailyReturns.reduce((worst, h) => (h.daily_return_pct ?? 0) < (worst.daily_return_pct ?? 0) ? h : worst)
    : null;

  // 총 매매 횟수 (follow 구간)
  const totalTrades = followDecisions.filter(
    (d) => d.executed && d.orders && d.orders.length > 0
  ).length;

  // 투자 비중 (주식 vs 현금)
  const investPct = totalAsset > 0 ? ((totalAsset - cash) / totalAsset * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">실전 투자</h1>
          {badge && (
            <span className={`${badge.color} text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse`}>
              {badge.text}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-400">
          {(isLive || isClosingPrice) && fetchedAt ? (
            <>
              <span>
                {new Date(fetchedAt).toLocaleDateString("ko-KR", {
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

      {/* 추종 모드 배너 */}
      {follow && (
        <LiveFollowBanner
          investorId={follow.investorId}
          investorName={follow.investorName}
          strategy={follow.strategy}
          startDate={follow.startDate}
        />
      )}

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

      {/* 보유종목 */}
      <div className="bg-gray-800/50 rounded-xl p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-gray-400 mb-4">보유종목</h2>
        <LiveHoldingsTableWithPrice holdings={liveHoldings} />
      </div>

      {/* 운용 전략 & 현재 상태 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 전략 요약 */}
        <div className="bg-gray-800/50 rounded-xl p-4 sm:p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-400">운용 전략</h2>
          <p className="text-xs text-gray-300 leading-relaxed">
            {follow ? (
              <>
                <span className="text-amber-400 font-medium">
                  모드: {follow.investorName}({follow.investorId}) 추종.
                </span>{" "}
                시뮬레이션 속 {follow.investorName}의 당일 allocation을 그대로 실전 {krw(initialCapital)} 자본으로 복제합니다.
                레짐별 비중 제한은 해제되어 원본 전략을 재현하며, 손절/급락방어/손실한도 안전 장치만 적용됩니다.
              </>
            ) : (
              <>
                <span className="text-yellow-400 font-medium">
                  목표: KOSPI 대비 초과 수익(알파 양수 유지).
                </span>{" "}
                15명의 시뮬레이션 투자자 성과를 종합 분석하여 최적 종목과 비중을 결정하는 AI 메타 전략입니다.
              </>
            )}
          </p>

          {/* 매매 규칙 */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-gray-400">매매 규칙</h3>
            <div className="space-y-1.5 text-xs">
              <div className="bg-white/5 rounded-lg p-2.5 space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-blue-400">📅</span>
                  <span className="text-gray-300 font-medium">
                    {follow
                      ? `리밸런싱: 매일 (${follow.investorName}과 동일)`
                      : "리밸런싱: 격주 수요일"}
                  </span>
                </div>
                <p className="text-gray-500 pl-5">
                  {follow
                    ? `매일 ${follow.investorName}이 결정한 종목과 비중을 그대로 실전에 적용합니다.`
                    : "시뮬레이션 15명의 성과를 분석해 종목과 비중을 재조정합니다."}
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-2.5 space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-blue-400">🔻</span>
                  <span className="text-gray-300 font-medium">
                    손절: 매입가 대비{" "}
                    {currentRegime
                      ? `${({bull: "-10%", neutral: "-8%", bear: "-7%"} as Record<string, string>)[currentRegime] ?? "-8%"} (${regimeLabel[currentRegime] ?? currentRegime})`
                      : "시장 국면별 -7~10%"
                    }
                  </span>
                </div>
                <p className="text-gray-500 pl-5">
                  보유 종목이 매입가 대비 기준 이하로 떨어지면 즉시 매도합니다.
                  시장이 약세일수록 기준이 엄격해집니다 (약세 -7%, 중립 -8%, 강세 -10%).
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-2.5 space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-orange-400">🛡️</span>
                  <span className="text-gray-300 font-medium">급락 방어: +20% 도달 후 고점 대비 -15% 이탈 시 매도</span>
                </div>
                <p className="text-gray-500 pl-5">
                  충분히 오른 종목(+20%)이 고점 대비 급락하면 수익 반납을 막기 위해 즉시 매도합니다.
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-2.5 space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-yellow-400">💰</span>
                  <span className="text-gray-300 font-medium">
                    {follow
                      ? `최대 투자 비중: ${follow.investorName} 원본 그대로 (레짐 제한 해제)`
                      : currentRegime
                      ? `최대 투자 비중: ${({bull: 90, neutral: 60, bear: 30} as Record<string, number>)[currentRegime] ?? 60}% (${regimeLabel[currentRegime] ?? currentRegime})`
                      : "최대 투자 비중: 시장 국면별 30~90%"}
                  </span>
                </div>
                <p className="text-gray-500 pl-5">
                  {follow
                    ? `${follow.investorName}이 결정한 투자 비중을 레짐과 무관하게 그대로 반영합니다. 원본 전략의 공격성/방어성이 그대로 재현됩니다.`
                    : "나머지는 현금으로 보유합니다. 약세장에서는 현금 비중을 높이고, 강세장에서는 적극 투자합니다 (약세 30%, 중립 60%, 강세 90%)."}
                </p>
              </div>
            </div>
          </div>

          {/* 안전 장치 */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-medium text-gray-400">안전 장치</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
              <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-2.5">
                <span className="text-red-400 font-medium">일일 -3% 거래 중단</span>
                <p className="text-gray-500 mt-0.5">하루 손실이 -3%를 넘으면 그날 추가 거래를 하지 않습니다.</p>
              </div>
              <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-2.5">
                <span className="text-red-400 font-medium">누적 -10% 전량 청산</span>
                <p className="text-gray-500 mt-0.5">초기 자금 대비 -10%에 도달하면 모든 주식을 매도하고 운용을 중단합니다.</p>
              </div>
            </div>
          </div>
        </div>

        {/* 운용 상태 */}
        <div className="bg-gray-800/50 rounded-xl p-4 sm:p-5 space-y-4">
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

          {/* 기본 정보 */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-gray-400">기본 정보</h3>
            <div className="space-y-2 text-xs">
              <div className="bg-white/5 rounded-lg p-2.5 space-y-1.5">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 shrink-0">운용 기간</span>
                  <span className="text-gray-300 text-right">{startDate} ~ ({operatingDays}일)</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 shrink-0">시장 국면</span>
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
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 shrink-0">최근 리밸런싱</span>
                  <span className="text-gray-300">{lastRebalance?.date ?? "-"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 shrink-0">총 매매 횟수</span>
                  <span className="text-gray-300">{totalTrades}회</span>
                </div>
              </div>
            </div>
          </div>

          {/* 투자 비중 바 */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-gray-400">현재 투자 비중</h3>
            <div className="bg-white/5 rounded-lg p-2.5 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">주식 {investPct.toFixed(0)}%</span>
                <span className="text-gray-500">현금 {(100 - investPct).toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-indigo-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(investPct, 100)}%` }}
                />
              </div>
              {follow?.todayAllocation ? (
                <p className="text-[11px] text-gray-500">
                  {follow.investorName} 오늘 목표:{" "}
                  <span className="text-gray-300">
                    {((follow.todayAllocation.allocation_sum ?? 0) * 100).toFixed(0)}%
                  </span>{" · "}
                  종목 {follow.todayAllocation.num_stocks}개
                </p>
              ) : follow ? (
                <p className="text-[11px] text-gray-500">
                  {follow.investorName} 원본 비중을 그대로 복제합니다 (레짐 제한 해제)
                </p>
              ) : (
                currentRegime && (
                  <p className="text-[11px] text-gray-500">
                    현재 {regimeLabel[currentRegime]}에서 최대{" "}
                    {({bull: 90, neutral: 60, bear: 30} as Record<string, number>)[currentRegime] ?? 60}
                    %까지 투자 가능
                  </p>
                )
              )}
            </div>
          </div>

          {/* 성과 지표 */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-gray-400">성과 지표</h3>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <div className="bg-white/5 rounded-lg p-2.5">
                <span className="text-gray-500">승률</span>
                <p className="text-gray-300 font-medium mt-0.5">
                  {dailyReturns.length > 0 ? `${winRate.toFixed(0)}%` : "-"}
                </p>
                <p className="text-gray-500 text-[11px]">
                  {dailyReturns.length > 0 ? `${operatingDays}일 중 ${winDays}일 상승` : ""}
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-2.5">
                <span className="text-gray-500">MDD</span>
                <p className={`font-medium mt-0.5 ${mdd < -0.03 ? "text-blue-400" : "text-gray-300"}`}>
                  {(mdd * 100).toFixed(1)}%
                </p>
                <p className="text-gray-500 text-[11px]">최고점 대비 최대 낙폭</p>
              </div>
              <div className="bg-white/5 rounded-lg p-2.5">
                <span className="text-gray-500">최대 수익일</span>
                {bestDay ? (
                  <>
                    <p className="text-red-400 font-medium mt-0.5">{pct(bestDay.daily_return_pct ?? 0)}</p>
                    <p className="text-gray-500 text-[11px]">{bestDay.date}</p>
                  </>
                ) : <p className="text-gray-500 mt-0.5">-</p>}
              </div>
              <div className="bg-white/5 rounded-lg p-2.5">
                <span className="text-gray-500">최대 손실일</span>
                {worstDay ? (
                  <>
                    <p className="text-blue-400 font-medium mt-0.5">{pct(worstDay.daily_return_pct ?? 0)}</p>
                    <p className="text-gray-500 text-[11px]">{worstDay.date}</p>
                  </>
                ) : <p className="text-gray-500 mt-0.5">-</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 자산 추이 + 현황 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-gray-800/50 rounded-xl p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-gray-400 mb-4">자산 추이</h2>
          <LiveAssetChart history={followHistory} initialCapital={effectiveInitial} />
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 sm:p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-400">포트폴리오 현황</h2>
          <div className="space-y-3">
            <InfoRow label="초기 자금" value={krw(Math.round(effectiveInitial))} />
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

      {/* 추종 비교 차트 */}
      {follow && (
        <LiveFollowComparison
          history={history}
          investorSnapshots={follow.investorSnapshots}
          investorId={follow.investorId}
          investorName={follow.investorName}
          followStartDate={follow.startDate}
        />
      )}

      {/* 오늘 추종 투자자 allocation vs 실전 */}
      {follow && (
        <LiveTodayAllocation
          allocation={follow.todayAllocation}
          liveHoldings={liveHoldings.map((h) => ({
            ticker: h.ticker,
            name: h.name,
            evalAmount: h.evalAmount,
          }))}
          totalAsset={totalAsset}
          stockNameMap={stockNameMap}
          investorName={follow.investorName}
          date={portfolio.date}
        />
      )}

      {/* 매매 히스토리 */}
      <div className="bg-gray-800/50 rounded-xl p-4 sm:p-5">
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
      <p className={`text-base sm:text-lg font-bold truncate ${valueColor || ""}`}>{value}</p>
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
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className={`text-right truncate ${bold ? "font-semibold" : ""} ${valueColor || ""}`}>
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

  const holdingDays = (d: string | null | undefined) => {
    if (!d) return null;
    return Math.floor((Date.now() - new Date(d + "T00:00:00+09:00").getTime()) / 86400000);
  };

  return (
    <>
      {/* 데스크탑: 테이블 */}
      <div className="hidden md:block overflow-x-auto">
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
              <th className="text-right pb-2 font-medium">매입금액</th>
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
                <td className="py-2.5 text-right text-gray-400">{krw(Math.round(h.avg_price * h.shares))}</td>
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
                  {h.acquired_date ? (
                    <>
                      {h.acquired_date.slice(5)}
                      <span className="text-gray-500 ml-1">
                        (D+{holdingDays(h.acquired_date)})
                      </span>
                    </>
                  ) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일: 카드 */}
      <div className="md:hidden space-y-3">
        {sorted.map((h) => {
          const days = holdingDays(h.acquired_date);
          return (
            <div key={h.ticker} className="bg-white/[0.03] rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Link
                    href={`/stocks/${encodeURIComponent(h.ticker)}`}
                    className="text-blue-400 hover:underline font-medium"
                  >
                    {h.name}
                  </Link>
                  <span className="text-gray-500 text-xs ml-1">
                    {h.ticker.replace(/\.(KS|KQ)$/, "")}
                  </span>
                  <span className="text-gray-500 text-xs ml-1">· {h.sector}</span>
                </div>
                <span className={`text-sm font-medium ${signColor(h.profitPct)}`}>
                  {pct(h.profitPct)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">수량</span>
                  <span className="text-gray-300">{h.shares}주</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">평균단가</span>
                  <span className="text-gray-300">{krw(h.avg_price)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">매입금액</span>
                  <span className="text-gray-400">{krw(Math.round(h.avg_price * h.shares))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">현재가</span>
                  <span className="text-gray-300">
                    {krw(h.currentPrice)}
                    {h.isLivePrice && h.changePct !== 0 && (
                      <span className={`ml-1 ${signColor(h.changePct)}`}>
                        {h.changePct > 0 ? "+" : ""}{h.changePct.toFixed(1)}%
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">평가금액</span>
                  <span className="text-gray-300 font-medium">{krw(Math.round(h.evalAmount))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">보유일</span>
                  <span className="text-gray-400">
                    {h.acquired_date ? `${h.acquired_date.slice(5)} (D+${days})` : "-"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
