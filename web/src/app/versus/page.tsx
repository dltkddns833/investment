import {
  getConfig,
  getWeeklyMVPs,
  getStreaks,
} from "@/lib/data";
import MatchupCard from "@/components/MatchupCard";
import InvestorPairSelector from "@/components/InvestorPairSelector";
import WeeklyHighlights from "@/components/WeeklyHighlights";

export const dynamic = "force-dynamic";

const RECOMMENDED_MATCHUPS = [
  { idA: "A", idB: "D", desc: "공격적 모멘텀 vs 역발상 투자" },
  { idA: "B", idB: "E", desc: "균형 분산 vs 동일 가중 벤치마크" },
  { idA: "G", idB: "H", desc: "뉴스 감성 vs 기술적 분석" },
  { idA: "C", idB: "I", desc: "보수적 우량주 vs 배당 투자" },
  { idA: "L", idB: "I", desc: "분할매도 vs 배당 투자" },
  { idA: "M", idB: "A", desc: "마켓 타이밍 vs 공격적 모멘텀" },
  { idA: "N", idB: "B", desc: "집중투자 vs 균형 분산" },
];

export default async function VersusPage() {
  const [config, weeklyMVPs, streaks] = await Promise.all([
    getConfig(),
    getWeeklyMVPs(),
    getStreaks(),
  ]);

  const investorMap = new Map(config.investors.map((inv) => [inv.id, inv.name]));

  // Get profiles for strategy names
  const profileMap = new Map<string, string>();
  for (const matchup of RECOMMENDED_MATCHUPS) {
    profileMap.set(matchup.idA, "");
    profileMap.set(matchup.idB, "");
  }

  const strategyNames: Record<string, string> = {
    A: "공격적 모멘텀",
    B: "균형 분산",
    C: "보수적 우량주",
    D: "역발상 투자",
    E: "동일 가중",
    F: "섹터 로테이션",
    G: "뉴스 감성",
    H: "기술적 분석",
    I: "배당 투자",
    J: "스마트머니 추종",
    K: "글로벌 자산배분",
    L: "분할매도",
    M: "마켓 타이밍",
    N: "집중투자",
  };

  const latestWeek = weeklyMVPs.length > 0 ? weeklyMVPs[0] : null;

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="animate-in">
        <h1 className="text-2xl md:text-3xl font-bold">대결 구도</h1>
        <p className="text-gray-400 text-sm mt-1">1:1 투자자 비교</p>
      </div>

      {/* Weekly Highlights */}
      <WeeklyHighlights latestWeek={latestWeek} streaks={streaks} />

      {/* Recommended Matchups */}
      <section className="animate-in">
        <h2 className="text-lg font-bold mb-3 section-header">추천 대결</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {RECOMMENDED_MATCHUPS.map((m) => (
            <MatchupCard
              key={`${m.idA}-${m.idB}`}
              idA={m.idA}
              nameA={investorMap.get(m.idA) ?? m.idA}
              strategyA={strategyNames[m.idA] ?? ""}
              idB={m.idB}
              nameB={investorMap.get(m.idB) ?? m.idB}
              strategyB={strategyNames[m.idB] ?? ""}
              description={m.desc}
            />
          ))}
        </div>
      </section>

      {/* Custom Matchup Selector */}
      <section className="glass-card p-4 md:p-5 animate-in">
        <h2 className="text-lg font-bold mb-3 section-header">자유 대결</h2>
        <InvestorPairSelector
          investors={config.investors.map((inv) => ({ id: inv.id, name: inv.name }))}
        />
      </section>
    </div>
  );
}
