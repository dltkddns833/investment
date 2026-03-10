import { supabase } from "./supabase";

// --- Types ---

export interface StockUniverse {
  ticker: string;
  name: string;
  sector: string;
}

export interface InvestorConfig {
  id: string;
  name: string;
  rebalance_frequency_days: number;
}

export interface Config {
  simulation: {
    start_date: string;
    initial_capital: number;
    currency: string;
    market: string;
  };
  investors: InvestorConfig[];
  stock_universe: StockUniverse[];
}

export interface InvestorProfile {
  name: string;
  strategy: string;
  description: string;
  rebalance_frequency_days: number;
  risk_tolerance: string;
  analysis_criteria: string[];
  investment_style: Record<string, string>;
}

export interface Holding {
  name: string;
  shares: number;
  avg_price: number;
}

export interface Transaction {
  date: string;
  type: "buy" | "sell";
  ticker: string;
  name: string;
  shares: number;
  price: number;
  amount: number;
  profit?: number;
}

export interface RebalanceRecord {
  date: string;
  trades: { type: string; ticker: string; shares: number; price: number }[];
  total_asset_after: number;
}

export interface Portfolio {
  investor: string;
  strategy: string;
  initial_capital: number;
  cash: number;
  holdings: Record<string, Holding>;
  transactions: Transaction[];
  last_rebalanced: string | null;
  rebalance_history: RebalanceRecord[];
}

export interface MarketPrice {
  name: string;
  price: number;
  change_pct: number;
}

export interface RankingEntry {
  rank: number;
  investor: string;
  strategy: string;
  total_asset: number;
  total_return: number;
  total_return_pct: number;
  num_holdings: number;
  cash_ratio: number;
  rebalance_frequency_days: number;
  rebalanced_today: boolean;
  total_rebalances: number;
}

export interface HoldingDetail {
  name: string;
  shares: number;
  avg_price: number;
  current_price: number;
  invested: number;
  value: number;
  profit: number;
  profit_pct: number;
}

export interface InvestorDetail {
  investor: string;
  strategy: string;
  initial_capital: number;
  cash: number;
  holdings_value: number;
  total_asset: number;
  total_return: number;
  total_return_pct: number;
  holdings: Record<string, HoldingDetail>;
  num_holdings: number;
  cash_ratio: number;
  rebalance_frequency_days: number;
  rebalanced_today: boolean;
  total_rebalances: number;
  trades_today: { type: string; ticker: string; shares: number; price: number }[];
}

export interface DailyReport {
  date: string;
  generated_at: string;
  market_prices: Record<string, MarketPrice>;
  rankings: RankingEntry[];
  investor_details: Record<string, InvestorDetail>;
}

export interface Allocation {
  date: string;
  investor: string;
  strategy: string;
  rationale: string;
  allocation: Record<string, number>;
  allocation_sum: number;
  num_stocks: number;
}

export interface NewsArticle {
  title: string;
  summary: string;
  category: string;
  source: string;
}

export interface News {
  date: string;
  collected_at: string;
  count: number;
  articles: NewsArticle[];
}

// --- Data Loading (Supabase) ---

export async function getConfig(): Promise<Config> {
  const { data } = await supabase
    .from("config")
    .select("*")
    .eq("id", 1)
    .single();
  return {
    simulation: data!.simulation,
    investors: data!.investors,
    stock_universe: data!.stock_universe,
  } as Config;
}

export async function getProfile(
  investorId: string
): Promise<InvestorProfile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", investorId)
    .single();
  if (!data) return null;
  return {
    name: data.name,
    strategy: data.strategy,
    description: data.description,
    rebalance_frequency_days: data.rebalance_frequency_days,
    risk_tolerance: data.risk_tolerance,
    analysis_criteria: data.analysis_criteria ?? [],
    investment_style: data.investment_style ?? {},
  };
}

export async function getPortfolio(
  investorId: string
): Promise<Portfolio | null> {
  const { data: row } = await supabase
    .from("portfolios")
    .select("*")
    .eq("investor_id", investorId)
    .single();
  if (!row) return null;

  const { data: txns } = await supabase
    .from("transactions")
    .select("*")
    .eq("investor_id", investorId)
    .order("id");

  const { data: rebs } = await supabase
    .from("rebalance_history")
    .select("*")
    .eq("investor_id", investorId)
    .order("id");

  const transactions: Transaction[] = (txns ?? []).map((t) => {
    const entry: Transaction = {
      date: t.date,
      type: t.type,
      ticker: t.ticker,
      name: t.name,
      shares: t.shares,
      price: t.price,
      amount: t.amount,
    };
    if (t.profit !== null) entry.profit = t.profit;
    return entry;
  });

  const rebalance_history: RebalanceRecord[] = (rebs ?? []).map((r) => ({
    date: r.date,
    trades: r.trades,
    total_asset_after: r.total_asset_after,
  }));

  return {
    investor: row.investor,
    strategy: row.strategy,
    initial_capital: row.initial_capital,
    cash: row.cash,
    holdings: row.holdings ?? {},
    transactions,
    last_rebalanced: row.last_rebalanced,
    rebalance_history,
  };
}

export async function getAllocation(
  investorId: string,
  date: string
): Promise<Allocation | null> {
  const { data } = await supabase
    .from("allocations")
    .select("*")
    .eq("investor_id", investorId)
    .eq("date", date)
    .single();
  if (!data) return null;
  return {
    date: data.date,
    investor: data.investor,
    strategy: data.strategy,
    rationale: data.rationale,
    allocation: data.allocation,
    allocation_sum: data.allocation_sum,
    num_stocks: data.num_stocks,
  };
}

export async function getDailyReport(
  date: string
): Promise<DailyReport | null> {
  const { data } = await supabase
    .from("daily_reports")
    .select("*")
    .eq("date", date)
    .single();
  if (!data) return null;
  return {
    date: data.date,
    generated_at: data.generated_at,
    market_prices: data.market_prices,
    rankings: data.rankings,
    investor_details: data.investor_details,
  };
}

export async function getNews(date: string): Promise<News | null> {
  const { data } = await supabase
    .from("news")
    .select("*")
    .eq("date", date)
    .single();
  if (!data) return null;
  return {
    date: data.date,
    collected_at: data.collected_at,
    count: data.count,
    articles: data.articles,
  };
}

export async function getAvailableReportDates(): Promise<string[]> {
  const { data } = await supabase
    .from("daily_reports")
    .select("date")
    .order("date", { ascending: false });
  return (data ?? []).map((r) => r.date);
}

export interface AssetSnapshot {
  date: string;
  total_asset: number;
}

export interface AllAssetSnapshot {
  date: string;
  [investorName: string]: number | string;
}

export async function getAllAssetHistory(
  investorNames: string[]
): Promise<AllAssetSnapshot[]> {
  const { data } = await supabase
    .from("daily_reports")
    .select("date, investor_details")
    .order("date", { ascending: true });

  if (!data) return [];

  return data.map((row) => {
    const snapshot: AllAssetSnapshot = { date: row.date };
    for (const name of investorNames) {
      snapshot[name] = row.investor_details?.[name]?.total_asset ?? 0;
    }
    return snapshot;
  });
}

export async function getAssetHistory(
  investorName: string
): Promise<AssetSnapshot[]> {
  const { data } = await supabase
    .from("daily_reports")
    .select("date, investor_details")
    .order("date", { ascending: true });

  if (!data) return [];

  return data
    .filter((row) => row.investor_details?.[investorName]?.total_asset != null)
    .map((row) => ({
      date: row.date,
      total_asset: row.investor_details[investorName].total_asset,
    }));
}

export async function getLatestReportDate(): Promise<string | null> {
  const { data } = await supabase
    .from("daily_reports")
    .select("date")
    .order("date", { ascending: false })
    .limit(1);
  return data && data.length > 0 ? data[0].date : null;
}
