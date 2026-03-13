import {
  getConfig,
  getLatestReportDate,
  getDailyReport,
  getProfile,
  getVersusData,
} from "@/lib/data";
import { krw, pct, signColor } from "@/lib/format";
import VersusChart from "@/components/VersusChart";
import VersusReturnDiff from "@/components/VersusReturnDiff";
import VersusPositionCompare from "@/components/VersusPositionCompare";
import Link from "next/link";

export const dynamic = "force-dynamic";

const COLORS: Record<string, string> = {
  A: "#ef4444", B: "#3b82f6", C: "#22c55e", D: "#f59e0b", E: "#8b5cf6",
  F: "#ec4899", G: "#06b6d4", H: "#14b8a6", I: "#f97316", J: "#a855f7",
};

interface Props {
  params: Promise<{ matchup: string }>;
}

export default async function VersusDetailPage({ params }: Props) {
  const { matchup } = await params;
  const parts = matchup.split("-vs-");
  if (parts.length !== 2) {
    return <p className="text-gray-400">잘못된 URL 형식입니다. (예: A-vs-D)</p>;
  }

  const [idA, idB] = parts;
  const validIds = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
  if (!validIds.includes(idA) || !validIds.includes(idB) || idA === idB) {
    return <p className="text-gray-400">유효하지 않은 투자자 ID입니다.</p>;
  }

  const [config, latestDate, profileA, profileB] = await Promise.all([
    getConfig(),
    getLatestReportDate(),
    getProfile(idA),
    getProfile(idB),
  ]);

  if (!latestDate || !profileA || !profileB) {
    return <p className="text-gray-400">데이터를 불러올 수 없습니다.</p>;
  }

  const [report, versusData] = await Promise.all([
    getDailyReport(latestDate).then((r) => r!),
    getVersusData(profileA.name, profileB.name),
  ]);

  const detailA = report.investor_details[profileA.name];
  const detailB = report.investor_details[profileB.name];

  if (!detailA || !detailB) {
    return <p className="text-gray-400">투자자 데이터가 없습니다.</p>;
  }

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Hero Header */}
      <div className="animate-in rounded-2xl bg-gradient-to-br from-red-500/5 via-purple-500/5 to-blue-500/5 p-4 md:p-6 border border-white/5">
        <div className="flex items-center justify-between gap-4">
          <Link href={`/investors/${idA}`} className="text-center flex-1 hover:opacity-80 transition-opacity">
            <div className="text-xl md:text-2xl font-bold" style={{ color: COLORS[idA] }}>{profileA.name}</div>
            <div className="text-xs text-gray-500 mt-1">{profileA.strategy}</div>
          </Link>
          <div className="shrink-0 px-4 py-2 rounded-full bg-gradient-to-r from-red-500/20 to-blue-500/20 text-lg font-bold text-gray-300">
            VS
          </div>
          <Link href={`/investors/${idB}`} className="text-center flex-1 hover:opacity-80 transition-opacity">
            <div className="text-xl md:text-2xl font-bold" style={{ color: COLORS[idB] }}>{profileB.name}</div>
            <div className="text-xs text-gray-500 mt-1">{profileB.strategy}</div>
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-in">
        <div className="glass-card p-3 text-center">
          <div className="text-[10px] text-gray-500 mb-1">총자산</div>
          <div className="text-sm font-bold" style={{ color: COLORS[idA] }}>{krw(detailA.total_asset)}</div>
          <div className="text-sm font-bold mt-1" style={{ color: COLORS[idB] }}>{krw(detailB.total_asset)}</div>
        </div>
        <div className="glass-card p-3 text-center">
          <div className="text-[10px] text-gray-500 mb-1">수익률</div>
          <div className={`text-sm font-bold ${signColor(detailA.total_return_pct)}`}>{pct(detailA.total_return_pct)}</div>
          <div className={`text-sm font-bold mt-1 ${signColor(detailB.total_return_pct)}`}>{pct(detailB.total_return_pct)}</div>
        </div>
        <div className="glass-card p-3 text-center">
          <div className="text-[10px] text-gray-500 mb-1">일별 승리</div>
          <div className="text-sm font-bold" style={{ color: COLORS[idA] }}>{versusData.headToHead.winsA}일</div>
          <div className="text-sm font-bold mt-1" style={{ color: COLORS[idB] }}>{versusData.headToHead.winsB}일</div>
        </div>
        <div className="glass-card p-3 text-center">
          <div className="text-[10px] text-gray-500 mb-1">보유 종목</div>
          <div className="text-sm font-bold" style={{ color: COLORS[idA] }}>{detailA.num_holdings}종목</div>
          <div className="text-sm font-bold mt-1" style={{ color: COLORS[idB] }}>{detailB.num_holdings}종목</div>
        </div>
      </div>

      {/* Asset Comparison Chart */}
      <section className="glass-card p-4 md:p-5 animate-in">
        <h2 className="text-lg font-bold mb-3 section-header">누적 자산 비교</h2>
        <VersusChart
          data={versusData.assetHistory}
          investorA={profileA.name}
          investorB={profileB.name}
          initialCapital={config.simulation.initial_capital}
          colorA={COLORS[idA]}
          colorB={COLORS[idB]}
        />
      </section>

      {/* Daily Return Difference */}
      {versusData.returnDiff.length > 0 && (
        <section className="glass-card p-4 md:p-5 animate-in">
          <h2 className="text-lg font-bold mb-3 section-header">일별 수익률 차이</h2>
          <VersusReturnDiff
            data={versusData.returnDiff}
            investorA={profileA.name}
            investorB={profileB.name}
          />
        </section>
      )}

      {/* Position Comparison */}
      <section className="glass-card p-4 md:p-5 animate-in">
        <h2 className="text-lg font-bold mb-3 section-header">포지션 비교</h2>
        <VersusPositionCompare detailA={detailA} detailB={detailB} />
      </section>

      {/* Back link */}
      <div className="text-center">
        <Link href="/versus" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
          ← 대결 목록으로
        </Link>
      </div>
    </div>
  );
}
