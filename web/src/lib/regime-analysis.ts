import type { MarketRegime, AllAssetSnapshot } from "./data";

// --- Types ---

export interface RegimeSegment {
  regime: "bull" | "neutral" | "bear";
  start: string;
  end: string;
  days: number;
}

export interface RegimeInvestorPerformance {
  returnPct: number;
  days: number;
}

export interface RegimePerformance {
  investor: string;
  investorId: string;
  bull: RegimeInvestorPerformance | null;
  neutral: RegimeInvestorPerformance | null;
  bear: RegimeInvestorPerformance | null;
}

export interface OptimalCombination {
  bull: { investor: string; returnPct: number } | null;
  neutral: { investor: string; returnPct: number } | null;
  bear: { investor: string; returnPct: number } | null;
  combinedReturnPct: number;
}

// --- Functions ---

export function computeRegimeSegments(regimes: MarketRegime[]): RegimeSegment[] {
  if (regimes.length === 0) return [];

  const segments: RegimeSegment[] = [];
  let current: RegimeSegment = {
    regime: regimes[0].regime,
    start: regimes[0].date,
    end: regimes[0].date,
    days: 1,
  };

  for (let i = 1; i < regimes.length; i++) {
    if (regimes[i].regime === current.regime) {
      current.end = regimes[i].date;
      current.days++;
    } else {
      segments.push(current);
      current = {
        regime: regimes[i].regime,
        start: regimes[i].date,
        end: regimes[i].date,
        days: 1,
      };
    }
  }
  segments.push(current);

  return segments;
}

/**
 * 국면별 투자자 성과 계산
 * assetHistory의 날짜와 regimes의 날짜를 매칭하여 각 국면에서의 수익률을 계산
 */
export function computeRegimePerformance(
  regimes: MarketRegime[],
  assetHistory: AllAssetSnapshot[],
  investorNames: string[],
  investorIds: Record<string, string>
): RegimePerformance[] {
  if (regimes.length === 0 || assetHistory.length === 0) return [];

  // date → regime 맵
  const regimeMap = new Map<string, "bull" | "neutral" | "bear">();
  for (const r of regimes) {
    regimeMap.set(r.date, r.regime);
  }

  // date → asset snapshot 맵
  const assetMap = new Map<string, AllAssetSnapshot>();
  for (const a of assetHistory) {
    assetMap.set(a.date, a);
  }

  // 양쪽 모두 존재하는 날짜만 사용, 정렬
  const commonDates = assetHistory
    .map((a) => a.date)
    .filter((d) => regimeMap.has(d))
    .sort();

  if (commonDates.length < 2) return [];

  return investorNames.map((name) => {
    const perf: Record<string, { totalReturn: number; days: number }> = {
      bull: { totalReturn: 0, days: 0 },
      neutral: { totalReturn: 0, days: 0 },
      bear: { totalReturn: 0, days: 0 },
    };

    for (let i = 1; i < commonDates.length; i++) {
      const prevDate = commonDates[i - 1];
      const curDate = commonDates[i];
      const regime = regimeMap.get(curDate);
      if (!regime) continue;

      const prevSnap = assetMap.get(prevDate);
      const curSnap = assetMap.get(curDate);
      if (!prevSnap || !curSnap) continue;

      const prevAsset = prevSnap[name] as number;
      const curAsset = curSnap[name] as number;
      if (!prevAsset || !curAsset || prevAsset <= 0) continue;

      const dailyReturn = (curAsset - prevAsset) / prevAsset;
      perf[regime].totalReturn += dailyReturn;
      perf[regime].days++;
    }

    const toResult = (p: { totalReturn: number; days: number }): RegimeInvestorPerformance | null => {
      if (p.days === 0) return null;
      return { returnPct: Math.round(p.totalReturn * 10000) / 100, days: p.days };
    };

    return {
      investor: name,
      investorId: investorIds[name] ?? "",
      bull: toResult(perf.bull),
      neutral: toResult(perf.neutral),
      bear: toResult(perf.bear),
    };
  });
}

/**
 * 국면별 최적 투자자 조합
 */
export function computeOptimalCombination(
  performances: RegimePerformance[]
): OptimalCombination {
  const findBest = (regime: "bull" | "neutral" | "bear") => {
    let best: { investor: string; returnPct: number } | null = null;
    for (const p of performances) {
      const data = p[regime];
      if (data && (best === null || data.returnPct > best.returnPct)) {
        best = { investor: p.investor, returnPct: data.returnPct };
      }
    }
    return best;
  };

  const bull = findBest("bull");
  const neutral = findBest("neutral");
  const bear = findBest("bear");

  const combinedReturnPct =
    (bull?.returnPct ?? 0) + (neutral?.returnPct ?? 0) + (bear?.returnPct ?? 0);

  return { bull, neutral, bear, combinedReturnPct };
}
