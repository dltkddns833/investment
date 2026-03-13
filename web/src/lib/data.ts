import { supabase } from "./supabase";

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


export async function getStockTransactions(
  ticker: string
): Promise<StockTransaction[]> {
  const { data } = await supabase
    .from("transactions")
    .select("date, investor_id, type, shares, price, amount, profit")
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

  const results: WeeklyMVP[] = [];
  for (const [, weekReports] of weeks) {
    if (weekReports.length < 1) continue;
    const first = weekReports[0];
    const last = weekReports[weekReports.length - 1];
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

  return badges;
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
