import type { OptimalCombination } from "@/lib/regime-analysis";
import { pct, signColor } from "@/lib/format";

interface Props {
  combination: OptimalCombination;
  investorIds: Record<string, string>;
}

const REGIME_CONFIG = [
  { key: "bull" as const, label: "강세장", color: "bg-green-500", icon: "📈" },
  { key: "neutral" as const, label: "중립장", color: "bg-gray-500", icon: "➡️" },
  { key: "bear" as const, label: "약세장", color: "bg-red-500", icon: "📉" },
];

export default function OptimalCombinationPanel({ combination, investorIds }: Props) {
  const hasData = combination.bull || combination.neutral || combination.bear;

  if (!hasData) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        국면 전환 데이터가 충분하지 않습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {REGIME_CONFIG.map(({ key, label, color, icon }) => {
          const data = combination[key];
          return (
            <div
              key={key}
              className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-center"
            >
              <div className="flex items-center justify-center gap-2 mb-2">
                <div className={`w-2.5 h-2.5 rounded-sm ${color}`} />
                <span className="text-sm text-gray-400">{label} 최적</span>
              </div>
              {data ? (
                <>
                  <div className="text-lg font-bold">{data.investor}</div>
                  <div className={`text-sm font-medium ${signColor(data.returnPct)}`}>
                    {pct(data.returnPct)}
                  </div>
                </>
              ) : (
                <div className="text-gray-600 text-sm">데이터 없음</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-center">
        <div className="text-sm text-gray-400 mb-1">
          국면별 최적 투자자 조합 시 가상 수익률
        </div>
        <div className={`text-2xl font-bold ${signColor(combination.combinedReturnPct)}`}>
          {pct(combination.combinedReturnPct)}
        </div>
        <p className="text-xs text-gray-600 mt-1">
          각 국면에서 최고 성과 투자자를 선택했을 때의 합산 수익률
        </p>
      </div>
    </div>
  );
}
