import { NextResponse } from "next/server";
import {
  getQTransactions,
  getQPortfolio,
  getLatestQTotalAsset,
  getStockNames,
  type QTransaction,
} from "@/lib/q-data";
import { fetchCurrentPrice } from "@/lib/kis";
import { checkMarketOpen, canFetchPrices } from "@/lib/market-hours";
import { todayKst } from "@/lib/format";

export const dynamic = "force-dynamic";

interface TodayTrade {
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

const FORCED_EXIT_MINUTES = 30;

export async function GET() {
  const today = todayKst();
  const marketOpen = checkMarketOpen();
  const canFetch = canFetchPrices();

  const [todayTxs, portfolio, latestAsset, nameCache] = await Promise.all([
    getQTransactions(today),
    getQPortfolio(),
    getLatestQTotalAsset(),
    getStockNames(),
  ]);

  // 오늘 매매 사이클 매칭 (buy → sell)
  const trades: TodayTrade[] = [];
  const pendingBuys = new Map<string, QTransaction>();
  for (const tx of todayTxs) {
    const isCodeName = typeof tx.name === "string" && /^\d{6}$/.test(tx.name);
    const resolvedName =
      (!isCodeName && tx.name) || nameCache.get(tx.ticker) || tx.ticker.split(".")[0];

    if (tx.type === "buy") {
      pendingBuys.set(tx.ticker, { ...tx, name: resolvedName });
      trades.push({
        buy_at: tx.executed_at,
        sell_at: null,
        ticker: tx.ticker,
        name: resolvedName,
        buy_price: tx.price,
        sell_price: null,
        shares: tx.shares,
        pnl: null,
        pnl_pct: null,
        fee: tx.fee ?? 0,
        exit_reason: null,
        status: "open",
      });
    } else if (tx.type === "sell") {
      const buy = pendingBuys.get(tx.ticker);
      if (!buy) continue;
      pendingBuys.delete(tx.ticker);

      const pnl_pct = ((tx.price - buy.price) / buy.price) * 100;
      let exit_reason: "win" | "loss" | "forced";
      if (pnl_pct >= 4.0) exit_reason = "win";
      else if (pnl_pct <= -2.5) exit_reason = "loss";
      else exit_reason = "forced";

      const openIdx = trades.findIndex(
        (t) => t.ticker === tx.ticker && t.status === "open"
      );
      if (openIdx >= 0) {
        trades[openIdx] = {
          ...trades[openIdx],
          sell_at: tx.executed_at,
          sell_price: tx.price,
          pnl: tx.profit ?? (tx.price - buy.price) * tx.shares,
          pnl_pct,
          fee: (trades[openIdx].fee ?? 0) + (tx.fee ?? 0),
          exit_reason,
          status: "closed",
        };
      }
    }
  }

  // HOLDING 판단: pendingBuys에 항목이 남아있으면 보유 중
  const holdingTicker = Array.from(pendingBuys.keys())[0];
  const holdingBuy = holdingTicker ? pendingBuys.get(holdingTicker)! : null;

  let holdingResp: {
    ticker: string;
    name: string;
    shares: number;
    buy_price: number;
    buy_at_kst: string | null;
    current_price: number | null;
    pnl_pct: number | null;
    pnl_amount: number | null;
    forced_exit_at: string | null;
  } | null = null;

  if (holdingBuy) {
    let currentPrice: number | null = null;
    if (marketOpen) {
      try {
        const code = holdingBuy.ticker.split(".")[0];
        const priceData = await fetchCurrentPrice(code);
        currentPrice = priceData.price;
      } catch (e) {
        console.error("[status] KIS price fetch failed", e);
      }
    }
    const pnlPct =
      currentPrice !== null
        ? ((currentPrice - holdingBuy.price) / holdingBuy.price) * 100
        : null;
    const pnlAmount =
      currentPrice !== null
        ? (currentPrice - holdingBuy.price) * holdingBuy.shares
        : null;

    let forcedExitAt: string | null = null;
    if (holdingBuy.executed_at) {
      const buyMs = new Date(holdingBuy.executed_at).getTime();
      forcedExitAt = new Date(buyMs + FORCED_EXIT_MINUTES * 60_000).toISOString();
    }

    holdingResp = {
      ticker: holdingBuy.ticker,
      name: holdingBuy.name,
      shares: holdingBuy.shares,
      buy_price: holdingBuy.price,
      buy_at_kst: holdingBuy.executed_at,
      current_price: currentPrice,
      pnl_pct: pnlPct,
      pnl_amount: pnlAmount,
      forced_exit_at: forcedExitAt,
    };
  }

  // 상태 판정
  let status: "HOLDING" | "IDLE" | "MARKET_CLOSED";
  if (holdingResp) status = "HOLDING";
  else if (marketOpen) status = "IDLE";
  else status = "MARKET_CLOSED";

  // 오늘 요약
  const closedTrades = trades.filter((t) => t.status === "closed");
  const todayPnl = closedTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);

  // 누적 자산: 보유 중이면 현재 평가, 아니면 cash + 최신 스냅샷
  let totalAsset: number;
  if (holdingResp && holdingResp.current_price !== null) {
    totalAsset =
      portfolio.cash + holdingResp.current_price * holdingResp.shares;
  } else if (latestAsset !== null) {
    totalAsset = latestAsset;
  } else {
    totalAsset = portfolio.cash;
  }

  const cumulativeReturnPct =
    portfolio.initial_capital > 0
      ? ((totalAsset - portfolio.initial_capital) / portfolio.initial_capital) *
        100
      : 0;

  // 오늘 수익률: 전일 종가 기준 (latestAsset이 어제 스냅샷)
  const todayReturnPct =
    latestAsset && latestAsset > 0
      ? ((totalAsset - latestAsset) / latestAsset) * 100
      : 0;

  return NextResponse.json(
    {
      status,
      market_open: marketOpen,
      can_fetch: canFetch,
      holding: holdingResp,
      today_trades: trades,
      today_summary: {
        total_trades: closedTrades.length,
        win_count: closedTrades.filter((t) => t.exit_reason === "win").length,
        loss_count: closedTrades.filter((t) => t.exit_reason === "loss").length,
        forced_count: closedTrades.filter((t) => t.exit_reason === "forced")
          .length,
        pnl_amount: todayPnl,
        return_pct: todayReturnPct,
      },
      cumulative: {
        total_asset: totalAsset,
        cash: portfolio.cash,
        initial_capital: portfolio.initial_capital,
        return_pct: cumulativeReturnPct,
      },
      fetched_at: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
