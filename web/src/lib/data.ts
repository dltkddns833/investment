import fs from "fs";
import path from "path";

const BASE_DIR = path.resolve(process.cwd(), "..");

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

// --- Data Loading ---

function readJson<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function getConfig(): Config {
  return readJson<Config>(path.join(BASE_DIR, "config.json"))!;
}

export function getProfile(investorId: string): InvestorProfile | null {
  return readJson<InvestorProfile>(
    path.join(BASE_DIR, "investors", "profiles", `${investorId}.json`)
  );
}

export function getPortfolio(investorId: string): Portfolio | null {
  return readJson<Portfolio>(
    path.join(BASE_DIR, "investors", "portfolios", `${investorId}.json`)
  );
}

export function getAllocation(
  investorId: string,
  date: string
): Allocation | null {
  return readJson<Allocation>(
    path.join(BASE_DIR, "investors", "allocations", investorId, `${date}.json`)
  );
}

export function getDailyReport(date: string): DailyReport | null {
  return readJson<DailyReport>(
    path.join(BASE_DIR, "report", "daily", `${date}.json`)
  );
}

export function getNews(date: string): News | null {
  return readJson<News>(path.join(BASE_DIR, "news", `${date}.json`));
}

export function getAvailableReportDates(): string[] {
  const dir = path.join(BASE_DIR, "report", "daily");
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function getLatestReportDate(): string | null {
  const dates = getAvailableReportDates();
  return dates.length > 0 ? dates[0] : null;
}
