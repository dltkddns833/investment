import { supabase } from "./supabase";

export interface QTransaction {
  id: number;
  date: string;
  type: "buy" | "sell";
  ticker: string;
  name: string;
  shares: number;
  price: number;
  amount: number;
  profit: number | null;
  fee: number | null;
  executed_at: string | null;
}

export interface QTradeCycle {
  date: string;
  ticker: string;
  name: string;
  buy_price: number;
  sell_price: number;
  shares: number;
  pnl: number;
  pnl_pct: number;
  exit_reason: "win" | "loss" | "forced";
  total_fee: number;
  buy_at: string | null;
  sell_at: string | null;
}

export interface QDailyStats {
  date: string;
  total_asset: number;
  trade_count: number;
  win_count: number;
  loss_count: number;
  forced_count: number;
  pnl: number;
}

export interface QSummaryStats {
  total_trades: number;
  win_count: number;
  loss_count: number;
  forced_count: number;
  win_rate: number;
  avg_pnl_pct: number;
  total_pnl: number;
  total_fee: number;
  trading_days: number;
  avg_trades_per_day: number;
  avg_holding_minutes: number;
  top_stocks: { ticker: string; name: string; count: number }[];
  kospi_count: number;
  kosdaq_count: number;
}

export interface QPortfolio {
  cash: number;
  initial_capital: number;
  holdings: Record<string, { name: string; shares: number; avg_price: number }>;
}

export interface QDiaryEntry {
  date: string;
  diary: string;
}

export async function getQDiaryHistory(limit = 30): Promise<QDiaryEntry[]> {
  const { data } = await supabase
    .from("daily_stories")
    .select("date, diaries")
    .order("date", { ascending: false })
    .limit(limit);
  if (!data) return [];
  return data
    .map((row) => ({
      date: row.date as string,
      diary:
        (row.diaries as Record<string, string> | null)?.["정채원"] ?? "",
    }))
    .filter((entry) => entry.diary.length > 0);
}

export async function getStockNames(): Promise<Map<string, string>> {
  const { data } = await supabase.from("stock_names").select("ticker, name");
  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(row.ticker, row.name);
  return map;
}

export async function getQTransactions(date?: string): Promise<QTransaction[]> {
  let query = supabase
    .from("transactions")
    .select(
      "id, date, type, ticker, name, shares, price, amount, profit, fee, executed_at"
    )
    .eq("investor_id", "Q")
    .order("id", { ascending: true });
  if (date) query = query.eq("date", date);
  const { data } = await query;
  return (data as QTransaction[] | null) ?? [];
}

export async function getQTradeCycles(): Promise<QTradeCycle[]> {
  const [txs, nameCache] = await Promise.all([
    getQTransactions(),
    getStockNames(),
  ]);

  const cycles: QTradeCycle[] = [];
  const pendingBuys: Record<
    string,
    {
      date: string;
      price: number;
      shares: number;
      fee: number;
      name: string;
      executed_at: string | null;
    }[]
  > = {};

  for (const tx of txs) {
    const isCodeName = typeof tx.name === "string" && /^\d{6}$/.test(tx.name);
    const resolvedName =
      (!isCodeName && tx.name) ||
      nameCache.get(tx.ticker) ||
      tx.ticker.split(".")[0];
    if (tx.type === "buy") {
      if (!pendingBuys[tx.ticker]) pendingBuys[tx.ticker] = [];
      pendingBuys[tx.ticker].push({
        date: tx.date,
        price: tx.price,
        shares: tx.shares,
        fee: tx.fee ?? 0,
        name: resolvedName,
        executed_at: tx.executed_at,
      });
    } else if (tx.type === "sell") {
      const buys = pendingBuys[tx.ticker];
      const buy = buys?.shift();
      if (!buy) continue;

      const pnl_pct = ((tx.price - buy.price) / buy.price) * 100;
      let exit_reason: "win" | "loss" | "forced";
      if (pnl_pct >= 4.5) exit_reason = "win";
      else if (pnl_pct <= -2.5) exit_reason = "loss";
      else exit_reason = "forced";

      cycles.push({
        date: tx.date,
        ticker: tx.ticker,
        name: buy.name,
        buy_price: buy.price,
        sell_price: tx.price,
        shares: tx.shares,
        pnl: tx.profit ?? (tx.price - buy.price) * tx.shares,
        pnl_pct,
        exit_reason,
        total_fee: buy.fee + (tx.fee ?? 0),
        buy_at: buy.executed_at,
        sell_at: tx.executed_at,
      });
    }
  }

  return cycles;
}

export async function getQDailyStats(): Promise<QDailyStats[]> {
  const [cycles, snapshotsResult] = await Promise.all([
    getQTradeCycles(),
    supabase
      .from("portfolio_snapshots")
      .select("date, total_asset")
      .eq("investor_id", "Q")
      .order("date", { ascending: true }),
  ]);

  const assetMap = new Map(
    (snapshotsResult.data ?? []).map((s: { date: string; total_asset: number }) => [
      s.date,
      s.total_asset,
    ])
  );

  const byDate = new Map<
    string,
    { win: number; loss: number; forced: number; pnl: number }
  >();
  for (const cycle of cycles) {
    if (!byDate.has(cycle.date))
      byDate.set(cycle.date, { win: 0, loss: 0, forced: 0, pnl: 0 });
    const d = byDate.get(cycle.date)!;
    d[cycle.exit_reason]++;
    d.pnl += cycle.pnl;
  }

  const allDates = new Set([...byDate.keys(), ...assetMap.keys()]);
  return Array.from(allDates)
    .sort()
    .map((date) => {
      const d = byDate.get(date) ?? { win: 0, loss: 0, forced: 0, pnl: 0 };
      return {
        date,
        total_asset: assetMap.get(date) ?? 0,
        trade_count: d.win + d.loss + d.forced,
        win_count: d.win,
        loss_count: d.loss,
        forced_count: d.forced,
        pnl: d.pnl,
      };
    });
}

export function computeQSummaryStats(cycles: QTradeCycle[]): QSummaryStats {
  const win = cycles.filter((c) => c.exit_reason === "win").length;
  const loss = cycles.filter((c) => c.exit_reason === "loss").length;
  const forced = cycles.filter((c) => c.exit_reason === "forced").length;
  const total = cycles.length;

  const tradingDays = new Set(cycles.map((c) => c.date)).size;
  const totalPnl = cycles.reduce((s, c) => s + c.pnl, 0);
  const totalFee = cycles.reduce((s, c) => s + c.total_fee, 0);
  const avgPnlPct =
    total > 0 ? cycles.reduce((s, c) => s + c.pnl_pct, 0) / total : 0;

  let totalHoldingMs = 0;
  let holdingCount = 0;
  for (const c of cycles) {
    if (c.buy_at && c.sell_at) {
      const ms = new Date(c.sell_at).getTime() - new Date(c.buy_at).getTime();
      if (ms > 0 && ms < 60 * 60 * 1000) {
        totalHoldingMs += ms;
        holdingCount++;
      }
    }
  }
  const avgHoldingMinutes =
    holdingCount > 0 ? totalHoldingMs / holdingCount / 60_000 : 0;

  const stockCount = new Map<string, { name: string; count: number }>();
  for (const c of cycles) {
    const code = c.ticker.split(".")[0];
    if (!stockCount.has(code)) stockCount.set(code, { name: c.name, count: 0 });
    stockCount.get(code)!.count++;
  }
  const top_stocks = Array.from(stockCount.entries())
    .map(([ticker, { name, count }]) => ({ ticker, name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    total_trades: total,
    win_count: win,
    loss_count: loss,
    forced_count: forced,
    win_rate: total > 0 ? (win / total) * 100 : 0,
    avg_pnl_pct: avgPnlPct,
    total_pnl: totalPnl,
    total_fee: totalFee,
    trading_days: tradingDays,
    avg_trades_per_day: tradingDays > 0 ? total / tradingDays : 0,
    avg_holding_minutes: avgHoldingMinutes,
    top_stocks,
    kospi_count: cycles.filter((c) => c.ticker.endsWith(".KS")).length,
    kosdaq_count: cycles.filter((c) => c.ticker.endsWith(".KQ")).length,
  };
}

export async function getQPortfolio(): Promise<QPortfolio> {
  const { data } = await supabase
    .from("portfolios")
    .select("cash, initial_capital, holdings")
    .eq("investor_id", "Q")
    .single();
  return {
    cash: data?.cash ?? 0,
    initial_capital: data?.initial_capital ?? 5_000_000,
    holdings: data?.holdings ?? {},
  };
}

export async function getLatestQTotalAsset(): Promise<number | null> {
  const { data } = await supabase
    .from("portfolio_snapshots")
    .select("total_asset")
    .eq("investor_id", "Q")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.total_asset ?? null;
}
