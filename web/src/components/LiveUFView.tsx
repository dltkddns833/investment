"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { krw, pct, signColor } from "@/lib/format";
import type { Portfolio, InvestorSnapshot } from "@/lib/data";
import InvestorAvatar from "./InvestorAvatar";
import LiveAssetChart from "./LiveAssetChart";

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

interface Props {
  portfolio: Portfolio;
  snapshots: InvestorSnapshot[];
  diary: string | null;
  latestDate: string | null;
  initialCapital: number;
  seasonStartDate: string;
}

function checkMarketOpen(): boolean {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  return t >= 540 && t < 930;
}

function canFetchPrices(): boolean {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  return t >= 540;
}

const CACHE_TTL_OPEN_MS = 3 * 60 * 1000;
const CACHE_TTL_CLOSED_MS = 10 * 60 * 1000;

export default function LiveUFView({
  portfolio,
  snapshots,
  diary,
  latestDate,
  initialCapital,
  seasonStartDate,
}: Props) {
  const [kisData, setKisData] = useState<KISPortfolio | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMarketOpen, setIsMarketOpen] = useState(false);
  const [canFetch, setCanFetch] = useState(false);
  const lastFetchRef = useRef(0);

  useEffect(() => {
    setIsMarketOpen(checkMarketOpen());
    setCanFetch(canFetchPrices());
    const i = setInterval(() => {
      setIsMarketOpen(checkMarketOpen());
      setCanFetch(canFetchPrices());
    }, 60_000);
    return () => clearInterval(i);
  }, []);

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

  // 평가 데이터 (KIS 우선, fallback은 DB)
  const totalAsset = kisData?.total_asset ?? snapshots[snapshots.length - 1]?.total_asset ?? initialCapital;
  const totalReturn = totalAsset - initialCapital;
  const totalReturnPct = (totalReturn / initialCapital) * 100;

  // 일일 수익률 (전일 종가 대비, 시즌 첫 날은 initial 대비)
  const prevSnapshot = snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null;
  const baseAsset = prevSnapshot?.total_asset ?? initialCapital;
  const dailyReturn = totalAsset - baseAsset;
  const dailyReturnPct = (dailyReturn / baseAsset) * 100;

  // 매매 히스토리 (rebalance_history)
  const rebHistory = portfolio.rebalance_history
    .slice()
    .reverse()
    .filter((r) => r.trades && r.trades.length > 0)
    .slice(0, 10);

  // 자산 추이 (snapshots → LiveAssetChart 형식)
  const chartHistory = snapshots.map((s, i) => {
    const cumPct = initialCapital > 0 ? ((s.total_asset / initialCapital) - 1) * 100 : 0;
    return {
      date: s.date,
      cash: 0,
      holdings: {},
      total_asset: s.total_asset,
      daily_return_pct: i === 0 ? cumPct : ((s.total_asset / snapshots[i - 1].total_asset) - 1) * 100,
      cumulative_return_pct: cumPct,
      kospi_cumulative_pct: null,
      alpha_cumulative_pct: null,
      net_deposit: 0,
      cumulative_deposits: initialCapital,
    };
  });

  const holdings = kisData?.holdings ?? Object.entries(portfolio.holdings).map(([ticker, h]) => ({
    ticker,
    code: ticker.split(".")[0],
    name: h.name,
    shares: h.shares,
    avg_price: h.avg_price,
    current_price: h.avg_price,
    eval_amount: h.shares * h.avg_price,
    profit_pct: 0,
    change_pct: 0,
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <InvestorAvatar investorId="UF" size="lg" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">실전 투자 — 이상운</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            C 옵션 한국 매크로 로테이션 추종 · 시즌2 시작 {seasonStartDate}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={isRefreshing || !canFetch}
          className="px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-xs font-medium hover:bg-blue-500/20 transition-colors disabled:opacity-40"
        >
          {isRefreshing ? "조회 중…" : isMarketOpen ? "장중 LIVE" : canFetch ? "종가" : "장 시작 전"}
        </button>
      </div>

      {/* 요약 카드 4개 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="총자산"
          value={krw(totalAsset)}
          hint={kisData ? `KIS 실시간 · ${new Date(kisData.fetchedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}` : "DB 기준"}
        />
        <SummaryCard
          label="누적 수익률"
          value={pct(totalReturnPct)}
          valueClass={signColor(totalReturnPct)}
          hint={`${totalReturn >= 0 ? "+" : ""}${krw(totalReturn)} (시드 1,000만)`}
        />
        <SummaryCard
          label="일일 수익률"
          value={pct(dailyReturnPct)}
          valueClass={signColor(dailyReturnPct)}
          hint={prevSnapshot ? `vs ${prevSnapshot.date.slice(5)}` : "시즌 첫 날 = 누적"}
        />
        <SummaryCard
          label="보유 종목"
          value={`${holdings.length}종목`}
          hint={`현금 ${krw(kisData?.cash ?? portfolio.cash)}`}
        />
      </div>

      {/* 운용 전략 */}
      <section className="bg-gray-800/50 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">운용 전략</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm text-gray-400">
          <InfoRow label="추종 모델" value="BetterWealth FA 한국 매크로 로테이션 18판 + 25판 합집합" />
          <InfoRow label="종목 선정" value="affordable 19종목 (1주 < 시드의 5%, 못 사는 6종목 제외)" />
          <InfoRow label="리밸런싱" value="매일 09:10 체크 · 회사 비중 변경 시에만 매매" />
          <InfoRow label="자동화" value={`launchd com.investment.portfolio-follow`} />
          <InfoRow label="실전 매매" value="KIS API 시장가 · 매도→매수 순서" />
          <InfoRow label="안전 가드" value="휴장일 / 장외시간 / 킬스위치" />
        </div>
      </section>

      {/* 보유종목 */}
      <section className="bg-gray-800/50 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-300">
            보유종목 <span className="text-gray-500 font-normal">({holdings.length}종목)</span>
          </h2>
          {kisData && (
            <span className="text-xs text-gray-500">
              평가금 {krw(kisData.total_eval)} · 예수금 {krw(kisData.cash)}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-xs">
                <th className="text-left py-2 pr-2">종목</th>
                <th className="text-right px-2">수량</th>
                <th className="text-right px-2">매입가</th>
                <th className="text-right px-2">현재가</th>
                <th className="text-right px-2">평가금</th>
                <th className="text-right pl-2">수익률</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.ticker} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-2 pr-2">
                    <Link
                      href={`/stocks/${h.ticker}`}
                      className="text-blue-400 hover:underline"
                    >
                      {h.name}
                    </Link>
                    <div className="text-[10px] text-gray-500">{h.code}</div>
                  </td>
                  <td className="text-right px-2 font-mono tabular-nums">{h.shares}</td>
                  <td className="text-right px-2 font-mono tabular-nums text-gray-400">
                    {krw(h.avg_price)}
                  </td>
                  <td className="text-right px-2 font-mono tabular-nums">
                    {krw(h.current_price)}
                  </td>
                  <td className="text-right px-2 font-mono tabular-nums">
                    {krw(h.eval_amount)}
                  </td>
                  <td className={`text-right pl-2 font-mono tabular-nums ${signColor(h.profit_pct)}`}>
                    {pct(h.profit_pct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 자산 추이 */}
      {chartHistory.length > 1 && (
        <section className="bg-gray-800/50 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">자산 추이</h2>
          <LiveAssetChart history={chartHistory} initialCapital={initialCapital} />
        </section>
      )}

      {chartHistory.length <= 1 && (
        <section className="bg-gray-800/50 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">자산 추이</h2>
          <p className="text-center text-gray-500 py-6 text-sm">
            시즌2 데이터 누적 중 (다음 영업일부터 차트 표시)
          </p>
        </section>
      )}

      {/* 매매 히스토리 */}
      <section className="bg-gray-800/50 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">매매 히스토리</h2>
        {rebHistory.length === 0 ? (
          <p className="text-center text-gray-500 py-4 text-sm">아직 리밸런싱 기록이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {rebHistory.map((reb, i) => (
              <div key={i} className="bg-gray-900/40 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{reb.date}</span>
                  <span className="text-xs text-gray-500">
                    총자산 {krw(reb.total_asset_after)} · {reb.trades.length}건
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {reb.trades.map((t, ti) => (
                    <span
                      key={ti}
                      className={`text-xs px-2 py-0.5 rounded ${
                        t.type === "buy"
                          ? "bg-red-500/10 text-red-400"
                          : "bg-blue-500/10 text-blue-400"
                      }`}
                    >
                      {t.type === "buy" ? "매수" : "매도"} {t.ticker} {t.shares}주
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 이상운 일기 */}
      {diary && (
        <section className="bg-blue-950/30 border border-blue-500/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <InvestorAvatar investorId="UF" size="sm" />
            <h2 className="text-sm font-semibold text-blue-300">
              이상운 일기 — {latestDate}
            </h2>
          </div>
          <p className="text-sm text-gray-300 whitespace-pre-line leading-relaxed">
            {diary}
          </p>
        </section>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  valueClass = "",
}: {
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-gray-800/50 rounded-xl p-4">
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`text-lg font-bold mt-1 font-mono tabular-nums ${valueClass}`}>{value}</div>
      {hint && <div className="text-[10px] text-gray-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-gray-500 min-w-[80px]">{label}</span>
      <span className="text-gray-300 flex-1">{value}</span>
    </div>
  );
}
