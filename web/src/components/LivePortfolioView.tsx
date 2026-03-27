"use client";

import { useLivePrices } from "@/lib/live-prices";
import { krw, pct, signColor } from "@/lib/format";
import type { RealPortfolioEntry, MetaDecision } from "@/lib/data";
import LiveAssetChart from "./LiveAssetChart";
import LiveHoldingsTable from "./LiveHoldingsTable";
import LiveDecisionHistory from "./LiveDecisionHistory";

interface HoldingEntry {
  ticker: string;
  name: string;
  shares: number;
  avg_price: number;
  sector: string;
}

interface Props {
  portfolio: RealPortfolioEntry;
  history: RealPortfolioEntry[];
  decisions: MetaDecision[];
  holdings: HoldingEntry[];
  initialCapital: number;
}

export default function LivePortfolioView({
  portfolio,
  history,
  decisions,
  holdings,
  initialCapital,
}: Props) {
  const { prices, isLive, isClosingPrice, isRefreshing, refresh, fetchedAt } =
    useLivePrices();

  // 실시간 시세로 재계산
  let totalEval = 0;
  const liveHoldings = holdings.map((h) => {
    const livePrice = prices?.[h.ticker]?.price;
    const currentPrice = livePrice ?? h.avg_price;
    const evalAmount = h.shares * currentPrice;
    totalEval += evalAmount;
    const profitPct =
      h.avg_price > 0 ? ((currentPrice / h.avg_price - 1) * 100) : 0;
    return {
      ...h,
      currentPrice,
      evalAmount,
      profitPct,
      isLivePrice: livePrice != null,
    };
  });

  // DB total_asset에서 주식평가를 빼서 실제 현금 역산 (D+2 정산 이중 계산 방지)
  const dbStockEval = Object.values(portfolio.holdings).reduce(
    (sum, h) => sum + h.shares * h.avg_price, 0
  );
  const cash = portfolio.total_asset - dbStockEval;
  const totalAsset = prices ? cash + totalEval : portfolio.total_asset;
  const cumulativeReturn = ((totalAsset / initialCapital - 1) * 100);

  // 전일 자산 기준 일일 수익률
  const prevPortfolio = history.length >= 2 ? history[history.length - 2] : null;
  const prevTotalAsset = prevPortfolio?.total_asset ?? initialCapital;
  const dailyReturn = prices
    ? ((totalAsset / prevTotalAsset - 1) * 100)
    : (portfolio.daily_return_pct ?? 0);

  const kospiReturn = portfolio.kospi_cumulative_pct;
  const alpha = prices && kospiReturn != null
    ? cumulativeReturn - kospiReturn
    : portfolio.alpha_cumulative_pct;

  const pnl = totalAsset - initialCapital;

  // 라이브 뱃지
  const badge = isLive
    ? { text: "LIVE", color: "bg-red-500" }
    : isClosingPrice
    ? { text: "종가", color: "bg-blue-500" }
    : null;

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
        <div className="flex items-center gap-2">
          {fetchedAt && (
            <span className="text-xs text-gray-500">
              {fetchedAt}
            </span>
          )}
          {(isLive || isClosingPrice) && (
            <button
              onClick={refresh}
              disabled={isRefreshing}
              className="text-xs text-gray-400 hover:text-white disabled:opacity-50"
            >
              {isRefreshing ? "..." : "새로고침"}
            </button>
          )}
          {!prices && (
            <span className="text-sm text-gray-400">
              {portfolio.date} 기준
            </span>
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
          value={kospiReturn != null ? pct(kospiReturn) : "-"}
          valueColor={kospiReturn != null ? signColor(kospiReturn) : "text-gray-500"}
        />
        <SummaryCard
          label="Alpha"
          value={alpha != null ? pct(alpha) : "-"}
          valueColor={alpha != null ? signColor(alpha) : "text-gray-500"}
          highlight
        />
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
  value,
  sub,
  valueColor,
  subColor,
  highlight,
}: {
  label: string;
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
      <p className="text-xs text-gray-400 mb-1">{label}</p>
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
    isLivePrice: boolean;
  }>;
}) {
  if (holdings.length === 0) {
    return <p className="text-center text-gray-500 py-4">보유종목 없음</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 text-xs border-b border-white/10">
            <th className="text-left pb-2 font-medium">종목</th>
            <th className="text-left pb-2 font-medium">섹터</th>
            <th className="text-right pb-2 font-medium">수량</th>
            <th className="text-right pb-2 font-medium">평균단가</th>
            <th className="text-right pb-2 font-medium">현재가</th>
            <th className="text-right pb-2 font-medium">평가금액</th>
            <th className="text-right pb-2 font-medium">수익률</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {holdings.map((h) => (
            <tr key={h.ticker} className="hover:bg-white/5">
              <td className="py-2.5">
                <span className="text-gray-200">{h.name}</span>
                <span className="text-gray-500 text-xs ml-1">
                  {h.ticker.replace(/\.(KS|KQ)$/, "")}
                </span>
              </td>
              <td className="py-2.5 text-gray-400">{h.sector}</td>
              <td className="py-2.5 text-right">{h.shares}주</td>
              <td className="py-2.5 text-right">{krw(h.avg_price)}</td>
              <td className="py-2.5 text-right">
                {krw(h.currentPrice)}
              </td>
              <td className="py-2.5 text-right font-medium">
                {krw(Math.round(h.evalAmount))}
              </td>
              <td className={`py-2.5 text-right font-medium ${signColor(h.profitPct)}`}>
                {pct(h.profitPct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
