import { supabase } from "./supabase";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

// --- Types ---

export interface StockUniverse {
  ticker: string;
  name: string;
  sector: string;
  description?: string;
}

export interface InvestorConfig {
  id: string;
  name: string;
  rebalance_frequency_days: number;
}

export interface FollowConfig {
  follow_investor_id: string | null;
  follow_start_date: string | null;
  rebalance_frequency: string | null;
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
  follow: FollowConfig;
}

export interface InvestorProfile {
  name: string;
  strategy: string;
  description: string;
  rebalance_frequency_days: number;
  risk_tolerance: string;
  risk_grade: string;
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
  fee?: number;
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

export interface SentimentScore {
  score: number;
  label: string;
  reason: string;
}

export interface Allocation {
  date: string;
  investor: string;
  strategy: string;
  rationale: string;
  allocation: Record<string, number>;
  allocation_sum: number;
  num_stocks: number;
  sentiment_scores?: Record<string, SentimentScore> | null;
}

export interface NewsArticle {
  title: string;
  summary: string;
  category: string;
  source: string;
  url?: string;
}

export interface News {
  date: string;
  collected_at: string;
  count: number;
  articles: NewsArticle[];
}

export interface DailyReturn {
  date: string;
  return_pct: number;
}

export interface PeriodSummary {
  investor: string;
  strategy: string;
  period_return_pct: number;
  total_return_pct: number;
  total_asset: number;
  trading_days: number;
}


export interface StockTransaction {
  date: string;
  investor_id: string;
  type: "buy" | "sell";
  shares: number;
  price: number;
  amount: number;
  profit?: number;
  fee?: number;
}

export interface DailyStories {
  date: string;
  generated_at: string;
  commentary: string;
  diaries: Record<string, string>;
}

// --- Data Loading (Supabase) ---

export async function getConfig(): Promise<Config> {
  const { data } = await supabase
    .from("config")
    .select("*")
    .eq("id", 1)
    .single();
  const mm = data?.risk_limits?.meta_manager ?? {};
  return {
    simulation: data!.simulation,
    investors: data!.investors,
    stock_universe: data!.stock_universe,
    follow: {
      follow_investor_id: mm.follow_investor_id ?? null,
      follow_start_date: mm.follow_start_date ?? null,
      rebalance_frequency: mm.rebalance_frequency ?? null,
    },
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
    risk_grade: data.risk_grade ?? "",
    analysis_criteria: data.analysis_criteria ?? [],
    investment_style: data.investment_style ?? {},
  };
}

export async function getProfileRiskGrades(): Promise<Record<string, string>> {
  const { data } = await supabase.from("profiles").select("name, risk_grade");
  if (!data) return {};
  return Object.fromEntries(data.map((d) => [d.name, d.risk_grade ?? ""]));
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
    if (t.fee) entry.fee = t.fee;
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
    sentiment_scores: data.sentiment_scores ?? null,
  };
}

export interface SentimentHistoryEntry {
  date: string;
  scores: Record<string, SentimentScore>;
}

export async function getSentimentHistory(
  investorId: string
): Promise<SentimentHistoryEntry[]> {
  const { data } = await supabase
    .from("allocations")
    .select("date, sentiment_scores")
    .eq("investor_id", investorId)
    .not("sentiment_scores", "is", null)
    .order("date", { ascending: true });

  if (!data) return [];
  return data.map((d) => ({
    date: d.date,
    scores: d.sentiment_scores as Record<string, SentimentScore>,
  }));
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

export async function getPrevRankMap(
  date: string
): Promise<Record<string, number> | null> {
  const { data } = await supabase
    .from("daily_reports")
    .select("rankings")
    .lt("date", date)
    .order("date", { ascending: false })
    .limit(1)
    .single();
  if (!data?.rankings) return null;
  const map: Record<string, number> = {};
  for (const r of data.rankings as { rank: number; investor: string }[]) {
    map[r.investor] = r.rank;
  }
  return map;
}

export async function getPrevAssetMap(
  date: string
): Promise<Record<string, number> | null> {
  const { data } = await supabase
    .from("daily_reports")
    .select("rankings")
    .lt("date", date)
    .order("date", { ascending: false })
    .limit(1)
    .single();
  if (!data?.rankings) return null;
  const map: Record<string, number> = {};
  for (const r of data.rankings as { investor: string; total_asset: number }[]) {
    map[r.investor] = r.total_asset;
  }
  return map;
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

export async function getDailyStories(
  date: string
): Promise<DailyStories | null> {
  const { data } = await supabase
    .from("daily_stories")
    .select("*")
    .eq("date", date)
    .single();
  if (!data) return null;
  return {
    date: data.date,
    generated_at: data.generated_at,
    commentary: data.commentary,
    diaries: data.diaries,
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
  investorNames: string[],
  initialCapital: number = 5_000_000
): Promise<AllAssetSnapshot[]> {
  const { data } = await supabase
    .from("daily_reports")
    .select("date, investor_details")
    .order("date", { ascending: true });

  if (!data) return [];

  return data.map((row) => {
    const snapshot: AllAssetSnapshot = { date: row.date };
    for (const name of investorNames) {
      snapshot[name] = row.investor_details?.[name]?.total_asset ?? initialCapital;
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

export interface CashflowSnapshot {
  date: string;
  cashflow_account: number;
  daily_pnl: number;
}

export async function getCashflowHistory(): Promise<CashflowSnapshot[]> {
  const { data } = await supabase
    .from("portfolio_snapshots")
    .select("date, total_asset, cashflow_account")
    .eq("investor_id", "P")
    .order("date", { ascending: true });

  if (!data) return [];

  return data
    .filter((row) => row.cashflow_account != null)
    .map((row, i, arr) => ({
      date: row.date,
      cashflow_account: row.cashflow_account ?? 0,
      daily_pnl: i === 0
        ? row.cashflow_account ?? 0
        : (row.cashflow_account ?? 0) - (arr[i - 1].cashflow_account ?? 0),
    }));
}

export interface AssetCompositionPoint {
  date: string;
  cash: number;
  [key: string]: number | string; // 종목명별 평가금액
}

export async function getAssetComposition(
  investorId: string
): Promise<AssetCompositionPoint[]> {
  const { data } = await supabase
    .from("portfolio_snapshots")
    .select("date, holdings, cash")
    .eq("investor_id", investorId)
    .order("date", { ascending: true });

  if (!data) return [];

  return data.map((s) => {
    const point: AssetCompositionPoint = { date: s.date, cash: s.cash };
    for (const [, detail] of Object.entries(
      (s.holdings ?? {}) as Record<string, HoldingDetail>
    )) {
      point[detail.name] = detail.value;
    }
    return point;
  });
}

export async function getDailyReturns(
  investorName: string | null,
  year: number,
  month: number
): Promise<DailyReturn[]> {
  const startDate = new Date(year, month - 2, 1).toISOString().slice(0, 10);
  const endDate = new Date(year, month, 0).toISOString().slice(0, 10);

  const { data } = await supabase
    .from("daily_reports")
    .select("date, investor_details")
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

  if (!data || data.length < 2) return [];

  const monthStart = `${year}-${String(month).padStart(2, "0")}`;
  const results: DailyReturn[] = [];

  for (let i = 1; i < data.length; i++) {
    if (!data[i].date.startsWith(monthStart)) continue;

    let prevTotal = 0;
    let currTotal = 0;

    if (investorName) {
      prevTotal = data[i - 1].investor_details?.[investorName]?.total_asset ?? 0;
      currTotal = data[i].investor_details?.[investorName]?.total_asset ?? 0;
    } else {
      for (const name of Object.keys(data[i].investor_details ?? {})) {
        prevTotal += data[i - 1].investor_details?.[name]?.total_asset ?? 0;
        currTotal += data[i].investor_details?.[name]?.total_asset ?? 0;
      }
    }

    const returnPct = prevTotal > 0 ? ((currTotal - prevTotal) / prevTotal) * 100 : 0;
    results.push({ date: data[i].date, return_pct: returnPct });
  }

  return results;
}

export async function getPeriodSummary(
  startDate: string,
  endDate: string
): Promise<PeriodSummary[]> {
  const { data } = await supabase
    .from("daily_reports")
    .select("date, investor_details")
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

  if (!data || data.length === 0) return [];

  const first = data[0];
  const last = data[data.length - 1];
  const results: PeriodSummary[] = [];

  for (const [name, detail] of Object.entries(last.investor_details ?? {})) {
    const d = detail as InvestorDetail;
    const firstDetail = first.investor_details?.[name] as InvestorDetail | undefined;
    const startAsset = firstDetail?.total_asset ?? d.initial_capital;
    const periodReturn = startAsset > 0 ? ((d.total_asset - startAsset) / startAsset) * 100 : 0;

    results.push({
      investor: name,
      strategy: d.strategy,
      period_return_pct: periodReturn,
      total_return_pct: d.total_return_pct,
      total_asset: d.total_asset,
      trading_days: data.length,
    });
  }

  results.sort((a, b) => b.period_return_pct - a.period_return_pct);
  return results;
}


export interface PeriodicReport {
  period_type: "monthly" | "quarterly";
  period_start: string;
  period_end: string;
  period_label: string;
  generated_at: string;
  trading_days: number;
  rankings: { investor: string; total_asset: number; total_return_pct: number; period_return_pct: number; rank: number }[];
  highlights: { mvp: { investor: string; period_return_pct: number } | null; worst: { investor: string; period_return_pct: number } | null } | null;
  summary: string;
}

export async function getPeriodicReports(
  periodType: "monthly" | "quarterly"
): Promise<PeriodicReport[]> {
  const { data } = await supabase
    .from("periodic_reports")
    .select("*")
    .eq("period_type", periodType)
    .order("period_label", { ascending: false });
  return (data ?? []) as PeriodicReport[];
}

export async function getStockTransactions(
  ticker: string
): Promise<StockTransaction[]> {
  const { data } = await supabase
    .from("transactions")
    .select("date, investor_id, type, shares, price, amount, profit, fee")
    .eq("ticker", ticker)
    .order("id", { ascending: false });

  if (!data) return [];

  return data.map((t) => {
    const entry: StockTransaction = {
      date: t.date,
      investor_id: t.investor_id,
      type: t.type,
      shares: t.shares,
      price: t.price,
      amount: t.amount,
    };
    if (t.profit !== null) entry.profit = t.profit;
    if (t.fee) entry.fee = t.fee;
    return entry;
  });
}

export async function getLatestReportDate(): Promise<string | null> {
  const { data } = await supabase
    .from("daily_reports")
    .select("date")
    .order("date", { ascending: false })
    .limit(1);
  return data && data.length > 0 ? data[0].date : null;
}

// --- Issue #2: 투자자 간 상관관계 & 대결 구도 ---

export interface CorrelationEntry {
  investorA: string;
  investorB: string;
  correlation: number;
}

export interface PositionOverlap {
  investorA: string;
  investorB: string;
  overlap: number;
  sharedTickers: string[];
  onlyA: string[];
  onlyB: string[];
}

export interface StockPopularity {
  ticker: string;
  name: string;
  sector: string;
  holders: string[];
  holderCount: number;
}

// --- Issue #19: 리그 시스템 (시즌제 + 승점) ---

export interface LeagueStanding {
  rank: number;
  investor: string;
  investorId: string;
  points: number;
  avgRank: number;
  rank1Days: number;
  pointsPerDay: number;
}

export interface SeasonSummary {
  seasonLabel: string;       // "2026-03"
  seasonName: string;        // "3월 시즌"
  champion: { investor: string; investorId: string; points: number } | null;
  standings: LeagueStanding[];
  tradingDays: number;
  isCurrent: boolean;
}

export interface InvestorStreak {
  investor: string;
  currentRank1Streak: number;
  bestRank1Streak: number;
}

export interface WeeklyMVP {
  weekStart: string;
  weekEnd: string;
  mvp: { investor: string; returnPct: number };
  worst: { investor: string; returnPct: number };
}

export interface Badge {
  investor: string;
  type: string;
  date: string;
  description: string;
}

interface DailyReportRow {
  date: string;
  rankings: RankingEntry[];
  investor_details: Record<string, InvestorDetail>;
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

export async function getAllDailyReports(): Promise<DailyReportRow[]> {
  const { data } = await supabase
    .from("daily_reports")
    .select("date, rankings, investor_details")
    .order("date", { ascending: true });
  return (data ?? []) as DailyReportRow[];
}

export async function getReturnCorrelationMatrix(
  investorNames: string[]
): Promise<CorrelationEntry[]> {
  const reports = await getAllDailyReports();
  if (reports.length < 3) return [];

  // Build daily return series per investor
  const returnSeries: Record<string, number[]> = {};
  for (const name of investorNames) returnSeries[name] = [];

  for (let i = 1; i < reports.length; i++) {
    for (const name of investorNames) {
      const prev = reports[i - 1].investor_details?.[name]?.total_asset ?? 0;
      const curr = reports[i].investor_details?.[name]?.total_asset ?? 0;
      const ret = prev > 0 ? (curr - prev) / prev : 0;
      returnSeries[name].push(ret);
    }
  }

  // Compute pairwise correlation
  const results: CorrelationEntry[] = [];
  for (let i = 0; i < investorNames.length; i++) {
    for (let j = i + 1; j < investorNames.length; j++) {
      results.push({
        investorA: investorNames[i],
        investorB: investorNames[j],
        correlation: pearsonCorrelation(
          returnSeries[investorNames[i]],
          returnSeries[investorNames[j]]
        ),
      });
    }
  }
  return results;
}

export function getPositionOverlaps(
  investorDetails: Record<string, InvestorDetail>
): PositionOverlap[] {
  const names = Object.keys(investorDetails);
  const results: PositionOverlap[] = [];

  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const tickersA = new Set(Object.keys(investorDetails[names[i]].holdings));
      const tickersB = new Set(Object.keys(investorDetails[names[j]].holdings));
      const shared = [...tickersA].filter((t) => tickersB.has(t));
      const onlyA = [...tickersA].filter((t) => !tickersB.has(t));
      const onlyB = [...tickersB].filter((t) => !tickersA.has(t));
      const union = new Set([...tickersA, ...tickersB]).size;
      results.push({
        investorA: names[i],
        investorB: names[j],
        overlap: union > 0 ? shared.length / union : 0,
        sharedTickers: shared,
        onlyA,
        onlyB,
      });
    }
  }
  return results;
}

export function getStockPopularity(
  investorDetails: Record<string, InvestorDetail>,
  stockUniverse: StockUniverse[]
): StockPopularity[] {
  const holderMap = new Map<string, string[]>();
  for (const [name, detail] of Object.entries(investorDetails)) {
    for (const ticker of Object.keys(detail.holdings)) {
      const list = holderMap.get(ticker) ?? [];
      list.push(name);
      holderMap.set(ticker, list);
    }
  }
  return stockUniverse
    .map((s) => ({
      ticker: s.ticker,
      name: s.name,
      sector: s.sector,
      holders: holderMap.get(s.ticker) ?? [],
      holderCount: holderMap.get(s.ticker)?.length ?? 0,
    }))
    .sort((a, b) => b.holderCount - a.holderCount);
}

export async function getStreaks(): Promise<InvestorStreak[]> {
  const reports = await getAllDailyReports();
  if (reports.length === 0) return [];

  const streakMap = new Map<string, { current: number; best: number }>();

  for (const report of reports) {
    const rank1 = report.rankings.find((r) => r.rank === 1);
    if (!rank1) continue;
    const winner = rank1.investor;

    for (const [name, s] of streakMap) {
      if (name !== winner) {
        s.best = Math.max(s.best, s.current);
        s.current = 0;
      }
    }
    if (!streakMap.has(winner)) streakMap.set(winner, { current: 0, best: 0 });
    streakMap.get(winner)!.current++;
  }

  // Finalize best
  for (const s of streakMap.values()) {
    s.best = Math.max(s.best, s.current);
  }

  return [...streakMap.entries()]
    .map(([investor, s]) => ({
      investor,
      currentRank1Streak: s.current,
      bestRank1Streak: s.best,
    }))
    .sort((a, b) => b.currentRank1Streak - a.currentRank1Streak);
}

function getISOWeek(dateStr: string): string {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export async function getWeeklyMVPs(): Promise<WeeklyMVP[]> {
  const reports = await getAllDailyReports();
  if (reports.length < 2) return [];

  // Group by ISO week
  const weeks = new Map<string, DailyReportRow[]>();
  for (const r of reports) {
    const w = getISOWeek(r.date);
    if (!weeks.has(w)) weeks.set(w, []);
    weeks.get(w)!.push(r);
  }

  const weekKeys = [...weeks.keys()].sort();
  const results: WeeklyMVP[] = [];
  for (let wi = 0; wi < weekKeys.length; wi++) {
    const weekReports = weeks.get(weekKeys[wi])!;
    if (weekReports.length < 1) continue;

    // 1일짜리 주간이면 직전 주 마지막 날을 baseline으로 사용
    let first = weekReports[0];
    if (weekReports.length === 1 && wi > 0) {
      const prevWeek = weeks.get(weekKeys[wi - 1])!;
      first = prevWeek[prevWeek.length - 1];
    }
    const last = weekReports[weekReports.length - 1];
    if (first === last) continue; // baseline이 없으면 스킵
    const names = Object.keys(last.investor_details);

    let mvp = { investor: "", returnPct: -Infinity };
    let worst = { investor: "", returnPct: Infinity };

    for (const name of names) {
      const startAsset = first.investor_details[name]?.total_asset ?? 5000000;
      const endAsset = last.investor_details[name]?.total_asset ?? 5000000;
      const ret = startAsset > 0 ? ((endAsset - startAsset) / startAsset) * 100 : 0;
      if (ret > mvp.returnPct) mvp = { investor: name, returnPct: ret };
      if (ret < worst.returnPct) worst = { investor: name, returnPct: ret };
    }

    results.push({
      weekStart: first.date,
      weekEnd: last.date,
      mvp,
      worst,
    });
  }

  return results.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

export async function getBadges(): Promise<Badge[]> {
  const reports = await getAllDailyReports();
  if (reports.length === 0) return [];

  const badges: Badge[] = [];
  const earned = new Set<string>();

  const addBadge = (investor: string, type: string, date: string, desc: string) => {
    const key = `${investor}:${type}`;
    if (earned.has(key)) return;
    earned.add(key);
    badges.push({ investor, type, date, description: desc });
  };

  // Track rank-1 streaks for badges
  const rank1Streaks = new Map<string, number>();

  for (const report of reports) {
    const rank1 = report.rankings.find((r) => r.rank === 1);
    if (rank1) {
      for (const name of rank1Streaks.keys()) {
        if (name !== rank1.investor) rank1Streaks.set(name, 0);
      }
      rank1Streaks.set(rank1.investor, (rank1Streaks.get(rank1.investor) ?? 0) + 1);
      const streak = rank1Streaks.get(rank1.investor)!;
      if (streak >= 3) addBadge(rank1.investor, "streak_3", report.date, "3일 연속 1위");
      if (streak >= 5) addBadge(rank1.investor, "streak_5", report.date, "5일 연속 1위");
    }

    for (const [name, detail] of Object.entries(report.investor_details)) {
      if (detail.total_return_pct > 0)
        addBadge(name, "first_profit", report.date, "첫 수익 달성");
      if (detail.total_asset >= 6000000)
        addBadge(name, "asset_6m", report.date, "총자산 600만원 돌파");
      if (detail.total_asset >= 7000000)
        addBadge(name, "asset_7m", report.date, "총자산 700만원 돌파");
      if (detail.num_holdings >= 10)
        addBadge(name, "holdings_10", report.date, "10종목 이상 보유");
      if (detail.cash_ratio >= 50)
        addBadge(name, "cash_king", report.date, "현금 비중 50% 이상");
    }
  }

  // 시즌 우승 뱃지 (완료된 시즌)
  const seasonHistory = await getSeasonHistory();
  const championCounts: Record<string, number> = {};
  for (const season of seasonHistory) {
    if (season.champion) {
      const name = season.champion.investor;
      championCounts[name] = (championCounts[name] ?? 0) + 1;
      const count = championCounts[name];
      if (count >= 3) addBadge(name, "season_champion_3", season.seasonLabel, "트리플 크라운");
      else if (count >= 2) addBadge(name, "season_champion_2", season.seasonLabel, "시즌 2회 우승");
      else addBadge(name, "season_champion", season.seasonLabel, `${season.seasonName} 우승`);
    }
  }

  return badges;
}

// --- Issue #18: 성과 기여도 분석 (Performance Attribution) ---
// 순수 함수는 lib/attribution.ts에 분리 (클라이언트 컴포넌트에서도 사용 가능)
export { computeAttribution, computeAllAttributions } from "./attribution";
export type { StockAttribution, SectorAttribution, InvestorAttribution } from "./attribution";

// --- Issue #1: 성과 분석 고도화 ---

export interface PerformanceStats {
  investor: string;        // 투자자 이름
  investorId: string;      // A~K
  sharpeRatio: number | null;  // 연환산 샤프비율
  mdd: number | null;          // 최대낙폭 % (음수, 예: -12.5)
  volatility: number | null;   // 연환산 변동성 %
  alpha: number | null;        // 누적수익률 - E(정기준) 수익률
  winRate: number | null;      // 매도 거래 중 profit > 0 비율 (0~100)
  totalReturnPct: number;      // 누적수익률
  tradingDays: number;
}

export async function getPerformanceStats(
  investorNames: string[],
  investorIds: string[],
  initialCapital: number = 5_000_000
): Promise<PerformanceStats[]> {
  const [assetHistory, sellTxns] = await Promise.all([
    getAllAssetHistory(investorNames, initialCapital),
    supabase
      .from("transactions")
      .select("investor_id, profit")
      .eq("type", "sell"),
  ]);

  // 매도 건별 승률 계산
  const winCounts: Record<string, { wins: number; total: number }> = {};
  for (const id of investorIds) winCounts[id] = { wins: 0, total: 0 };
  for (const row of sellTxns.data ?? []) {
    if (!winCounts[row.investor_id]) continue;
    winCounts[row.investor_id].total++;
    if ((row.profit ?? 0) > 0) winCounts[row.investor_id].wins++;
  }

  // 투자자 이름 → ID 맵
  const nameToId: Record<string, string> = {};
  for (let i = 0; i < investorNames.length; i++) nameToId[investorNames[i]] = investorIds[i] ?? "";

  // 정기준(E) 누적 수익률 계산 (알파 기준선)
  const benchmarkName = investorNames.find((n) => nameToId[n] === "E") ?? null;
  const lastRow = assetHistory[assetHistory.length - 1];
  const benchmarkFinalAsset = benchmarkName && lastRow
    ? ((lastRow[benchmarkName] as number) ?? initialCapital)
    : initialCapital;
  const benchmarkReturnPct = ((benchmarkFinalAsset - initialCapital) / initialCapital) * 100;

  const results: PerformanceStats[] = [];

  for (const name of investorNames) {
    const id = nameToId[name] ?? "";
    const assets = assetHistory.map((row) => (row[name] as number) ?? initialCapital);
    const tradingDays = assetHistory.length;

    // 일별 수익률 계산
    const dailyReturns: number[] = [];
    for (let i = 1; i < assets.length; i++) {
      const prev = assets[i - 1];
      const curr = assets[i];
      dailyReturns.push(prev > 0 ? (curr - prev) / prev : 0);
    }

    let sharpeRatio: number | null = null;
    let mdd: number | null = null;
    let volatility: number | null = null;

    if (tradingDays >= 5 && dailyReturns.length >= 4) {
      const n = dailyReturns.length;
      const mean = dailyReturns.reduce((a, b) => a + b, 0) / n;
      const variance = dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
      const std = Math.sqrt(variance);

      volatility = std * Math.sqrt(252) * 100;
      sharpeRatio = std > 0 ? (mean * 252) / (std * Math.sqrt(252)) : null;

      // MDD 계산
      let peak = initialCapital;
      let maxDrawdown = 0;
      for (const asset of assets) {
        if (asset > peak) peak = asset;
        const drawdown = (asset - peak) / peak;
        if (drawdown < maxDrawdown) maxDrawdown = drawdown;
      }
      mdd = maxDrawdown * 100;
    }

    const finalAsset = assets[assets.length - 1] ?? initialCapital;
    const totalReturnPct = ((finalAsset - initialCapital) / initialCapital) * 100;
    const alpha = name === benchmarkName ? 0 : totalReturnPct - benchmarkReturnPct;

    const winData = winCounts[id];
    const winRate = winData && winData.total > 0
      ? (winData.wins / winData.total) * 100
      : null;

    results.push({
      investor: name,
      investorId: id,
      sharpeRatio,
      mdd,
      volatility,
      alpha,
      winRate,
      totalReturnPct,
      tradingDays,
    });
  }

  return results;
}

export async function getTransactionSummary(
  investorIds: string[]
): Promise<Record<string, { totalBuyAmount: number; totalSellAmount: number; totalFees: number; sellCount: number }>> {
  const { data } = await supabase
    .from("transactions")
    .select("investor_id, type, amount, fee");

  const result: Record<string, { totalBuyAmount: number; totalSellAmount: number; totalFees: number; sellCount: number }> = {};
  for (const id of investorIds) {
    result[id] = { totalBuyAmount: 0, totalSellAmount: 0, totalFees: 0, sellCount: 0 };
  }

  for (const row of data ?? []) {
    const entry = result[row.investor_id];
    if (!entry) continue;
    const amount = row.amount ?? 0;
    const fee = row.fee ?? 0;
    if (row.type === "buy") {
      entry.totalBuyAmount += amount;
    } else {
      entry.totalSellAmount += amount;
      entry.sellCount++;
    }
    entry.totalFees += fee;
  }

  return result;
}

export async function getVersusData(
  investorA: string,
  investorB: string,
  initialCapital: number = 5_000_000
): Promise<{
  assetHistory: { date: string; [key: string]: number | string }[];
  returnDiff: { date: string; diff: number }[];
  headToHead: { winsA: number; winsB: number; draws: number };
}> {
  const reports = await getAllDailyReports();

  const assetHistory = reports.map((r) => ({
    date: r.date,
    [investorA]: r.investor_details[investorA]?.total_asset ?? initialCapital,
    [investorB]: r.investor_details[investorB]?.total_asset ?? initialCapital,
  }));

  const returnDiff: { date: string; diff: number }[] = [];
  let winsA = 0, winsB = 0, draws = 0;

  for (let i = 1; i < reports.length; i++) {
    const prevA = reports[i - 1].investor_details[investorA]?.total_asset ?? initialCapital;
    const currA = reports[i].investor_details[investorA]?.total_asset ?? initialCapital;
    const prevB = reports[i - 1].investor_details[investorB]?.total_asset ?? initialCapital;
    const currB = reports[i].investor_details[investorB]?.total_asset ?? initialCapital;
    const retA = prevA > 0 ? ((currA - prevA) / prevA) * 100 : 0;
    const retB = prevB > 0 ? ((currB - prevB) / prevB) * 100 : 0;
    const diff = retA - retB;
    returnDiff.push({ date: reports[i].date, diff });
    if (diff > 0.001) winsA++;
    else if (diff < -0.001) winsB++;
    else draws++;
  }

  return { assetHistory, returnDiff, headToHead: { winsA, winsB, draws } };
}

// --- Issue #19: 리그 승점 계산 ---

function computeLeaguePoints(
  reports: DailyReportRow[],
  investorIdMap: Record<string, string>
): LeagueStanding[] {
  const stats: Record<string, { points: number; rankSum: number; rank1: number; days: number }> = {};

  for (const report of reports) {
    for (const r of report.rankings) {
      if (!stats[r.investor]) stats[r.investor] = { points: 0, rankSum: 0, rank1: 0, days: 0 };
      const totalInvestors = report.rankings.length;
      const pts = totalInvestors + 1 - r.rank; // 11명이면: 1위=11, 11위=1
      stats[r.investor].points += pts;
      stats[r.investor].rankSum += r.rank;
      stats[r.investor].days++;
      if (r.rank === 1) stats[r.investor].rank1++;
    }
  }

  return Object.entries(stats)
    .map(([investor, s]) => ({
      rank: 0,
      investor,
      investorId: investorIdMap[investor] ?? "",
      points: s.points,
      avgRank: s.days > 0 ? Math.round((s.rankSum / s.days) * 10) / 10 : 0,
      rank1Days: s.rank1,
      pointsPerDay: s.days > 0 ? Math.round((s.points / s.days) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.points - a.points || a.avgRank - b.avgRank)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

const MONTH_NAMES = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

export async function getLeagueStandings(seasonLabel?: string): Promise<SeasonSummary | null> {
  const nowKst = dayjs().tz("Asia/Seoul");
  const currentLabel = seasonLabel ?? nowKst.format("YYYY-MM");
  const [year, monthStr] = currentLabel.split("-");
  const month = parseInt(monthStr, 10);
  const seasonName = `${year}년 ${MONTH_NAMES[month - 1]} 시즌`;

  const isCurrentMonth =
    parseInt(year, 10) === nowKst.year() && month === nowKst.month() + 1;

  if (!isCurrentMonth) {
    // 과거 시즌: periodic_reports에서 league_standings 읽기
    const { data } = await supabase
      .from("periodic_reports")
      .select("*")
      .eq("period_type", "monthly")
      .eq("period_label", currentLabel)
      .single();

    if (!data?.league_standings) return null;

    const ls = data.league_standings as {
      champion: { investor: string; investor_id: string; points: number };
      standings: { rank: number; investor: string; investor_id: string; points: number; avg_rank: number; rank1_days: number }[];
      trading_days: number;
    };

    return {
      seasonLabel: currentLabel,
      seasonName,
      champion: ls.champion ? { investor: ls.champion.investor, investorId: ls.champion.investor_id, points: ls.champion.points } : null,
      standings: ls.standings.map((s) => ({
        rank: s.rank,
        investor: s.investor,
        investorId: s.investor_id,
        points: s.points,
        avgRank: s.avg_rank,
        rank1Days: s.rank1_days,
        pointsPerDay: ls.trading_days > 0 ? Math.round((s.points / ls.trading_days) * 10) / 10 : 0,
      })),
      tradingDays: ls.trading_days,
      isCurrent: false,
    };
  }

  // 현재 시즌: daily_reports에서 on-the-fly 계산
  const firstDay = `${currentLabel}-01`;
  const lastDay = dayjs.tz(`${currentLabel}-01`, "Asia/Seoul").endOf("month").format("YYYY-MM-DD");

  const { data: reports } = await supabase
    .from("daily_reports")
    .select("date, rankings, investor_details")
    .gte("date", firstDay)
    .lte("date", lastDay)
    .order("date", { ascending: true });

  if (!reports || reports.length === 0) return null;

  const config = await getConfig();
  const investorIdMap: Record<string, string> = {};
  for (const inv of config.investors) investorIdMap[inv.name] = inv.id;

  const standings = computeLeaguePoints(reports as DailyReportRow[], investorIdMap);
  const champion = standings.length > 0 ? { investor: standings[0].investor, investorId: standings[0].investorId, points: standings[0].points } : null;

  return {
    seasonLabel: currentLabel,
    seasonName,
    champion,
    standings,
    tradingDays: reports.length,
    isCurrent: true,
  };
}

export async function getSeasonHistory(): Promise<SeasonSummary[]> {
  const { data } = await supabase
    .from("periodic_reports")
    .select("*")
    .eq("period_type", "monthly")
    .not("league_standings", "is", null)
    .order("period_label", { ascending: false });

  const seasons: SeasonSummary[] = [];

  for (const row of data ?? []) {
    const ls = row.league_standings as {
      champion: { investor: string; investor_id: string; points: number };
      standings: { rank: number; investor: string; investor_id: string; points: number; avg_rank: number; rank1_days: number }[];
      trading_days: number;
    };
    const [year, monthStr] = row.period_label.split("-");
    const month = parseInt(monthStr, 10);

    seasons.push({
      seasonLabel: row.period_label,
      seasonName: `${year}년 ${MONTH_NAMES[month - 1]} 시즌`,
      champion: ls.champion ? { investor: ls.champion.investor, investorId: ls.champion.investor_id, points: ls.champion.points } : null,
      standings: ls.standings.map((s) => ({
        rank: s.rank,
        investor: s.investor,
        investorId: s.investor_id,
        points: s.points,
        avgRank: s.avg_rank,
        rank1Days: s.rank1_days,
        pointsPerDay: ls.trading_days > 0 ? Math.round((s.points / ls.trading_days) * 10) / 10 : 0,
      })),
      tradingDays: ls.trading_days,
      isCurrent: false,
    });
  }

  return seasons;
}

// --- Issue #17: 백테스트 ---

export interface BacktestRanking {
  investor_id: string;
  name: string;
  strategy: string;
  final_asset: number;
  cumulative_return_pct: number;
  annualized_return_pct: number;
  sharpe_ratio: number;
  mdd_pct: number;
  volatility_pct: number;
  win_rate_pct: number;
  best_day_pct: number;
  worst_day_pct: number;
  trading_days: number;
}

export interface BacktestRun {
  id: string;
  start_date: string;
  end_date: string;
  trading_days: number;
  investors: string[];
  parameters: { initial_capital: number; trading_costs: Record<string, unknown> };
  summary: { rankings: BacktestRanking[] };
  created_at: string;
}

export interface BacktestSnapshot {
  investor_id: string;
  date: string;
  total_asset: number;
  cash: number;
}

export async function getBacktestRuns(): Promise<BacktestRun[]> {
  const { data } = await supabase
    .from("backtest_runs")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []) as BacktestRun[];
}

export async function getBacktestRun(runId: string): Promise<BacktestRun | null> {
  const { data } = await supabase
    .from("backtest_runs")
    .select("*")
    .eq("id", runId)
    .single();
  return (data as BacktestRun) ?? null;
}

export async function getBacktestSnapshots(
  runId: string
): Promise<BacktestSnapshot[]> {
  const { data } = await supabase
    .from("backtest_snapshots")
    .select("investor_id, date, total_asset, cash")
    .eq("run_id", runId)
    .order("date", { ascending: true });
  return (data ?? []) as BacktestSnapshot[];
}

// --- Market Regimes ---

export interface MarketRegime {
  date: string;
  regime: "bull" | "neutral" | "bear";
  bull_score: number;
  kospi_price: number;
  ma20: number;
  ma60: number;
  ma20_slope: number;
  volume_ratio: number;
  volatility_20d: number;
  details: Record<string, unknown>;
}

export async function getMarketRegimes(): Promise<MarketRegime[]> {
  const { data } = await supabase
    .from("market_regimes")
    .select("*")
    .order("date", { ascending: true });
  return (data ?? []) as MarketRegime[];
}

export async function getDailyLeaguePoints(seasonLabel?: string): Promise<{ date: string; points: Record<string, number> }[]> {
  const nowKst = dayjs().tz("Asia/Seoul");
  const label = seasonLabel ?? nowKst.format("YYYY-MM");
  const firstDay = `${label}-01`;
  const lastDay = dayjs.tz(`${label}-01`, "Asia/Seoul").endOf("month").format("YYYY-MM-DD");

  const { data: reports } = await supabase
    .from("daily_reports")
    .select("date, rankings")
    .gte("date", firstDay)
    .lte("date", lastDay)
    .order("date", { ascending: true });

  if (!reports || reports.length === 0) return [];

  const cumulative: Record<string, number> = {};
  return reports.map((r) => {
    const rankings = r.rankings as RankingEntry[];
    const totalInvestors = rankings.length;
    for (const entry of rankings) {
      cumulative[entry.investor] = (cumulative[entry.investor] ?? 0) + (totalInvestors + 1 - entry.rank);
    }
    return { date: r.date, points: { ...cumulative } };
  });
}

// --- Real Portfolio (실전 투자) ---

export interface RealPortfolioEntry {
  date: string;
  cash: number;
  holdings: Record<string, { shares: number; avg_price: number; name: string; acquired_date?: string }>;
  total_asset: number;
  daily_return_pct: number;
  cumulative_return_pct: number;
  kospi_cumulative_pct: number | null;
  alpha_cumulative_pct: number | null;
}

export interface MetaDecision {
  date: string;
  regime: string;
  decision_type?: string;
  selected_strategies: Record<string, number> | null;
  rationale: string;
  target_allocation: Record<string, number> | null;
  orders: Array<{ ticker: string; name: string; side: string; qty: number; price: number; status: string; avg_price?: number; profit_pct?: number }> | null;
  approved: boolean;
  executed: boolean;
}

export async function getRealPortfolioHistory(): Promise<RealPortfolioEntry[]> {
  const { data } = await supabase
    .from("real_portfolio")
    .select("*")
    .order("date", { ascending: true });
  return (data ?? []) as RealPortfolioEntry[];
}

export async function getLatestRealPortfolio(): Promise<RealPortfolioEntry | null> {
  const { data } = await supabase
    .from("real_portfolio")
    .select("*")
    .order("date", { ascending: false })
    .limit(1);
  return (data && data.length > 0 ? data[0] : null) as RealPortfolioEntry | null;
}

export async function getMetaDecisions(): Promise<MetaDecision[]> {
  const { data } = await supabase
    .from("meta_decisions")
    .select("date, regime, decision_type, selected_strategies, rationale, target_allocation, orders, approved, executed")
    .order("date", { ascending: false });
  return (data ?? []) as MetaDecision[];
}

// --- Follow 모드 전용 ---

export interface InvestorSnapshot {
  date: string;
  total_asset: number;
}

export async function getInvestorSnapshots(
  investorId: string,
  fromDate: string
): Promise<InvestorSnapshot[]> {
  const { data } = await supabase
    .from("portfolio_snapshots")
    .select("date, total_asset")
    .eq("investor_id", investorId)
    .gte("date", fromDate)
    .order("date", { ascending: true });
  return (data ?? []) as InvestorSnapshot[];
}

export async function getAllocationByInvestorName(
  investorName: string,
  date: string
): Promise<Allocation | null> {
  const { data } = await supabase
    .from("allocations")
    .select("*")
    .eq("investor", investorName)
    .eq("date", date)
    .maybeSingle();
  if (!data) return null;
  return {
    date: data.date,
    investor: data.investor,
    strategy: data.strategy,
    rationale: data.rationale,
    allocation: data.allocation,
    allocation_sum: data.allocation_sum,
    num_stocks: data.num_stocks,
    sentiment_scores: data.sentiment_scores ?? null,
  };
}
