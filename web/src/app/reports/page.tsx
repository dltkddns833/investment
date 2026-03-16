import {
  getDailyReturns,
  getLatestReportDate,
} from "@/lib/data";
import ReportsContent from "@/components/ReportsContent";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ month?: string }>;
}

export default async function ReportsPage({ searchParams }: Props) {
  const params = await searchParams;
  const latestDate = await getLatestReportDate();

  if (!latestDate) {
    return (
      <div>
        <h1 className="text-2xl md:text-3xl font-bold mb-4">리포트</h1>
        <p className="text-gray-400">아직 리포트가 없습니다.</p>
      </div>
    );
  }

  // Parse month param or use latest report date
  let year: number, month: number;
  if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
    const [y, m] = params.month.split("-").map(Number);
    year = y;
    month = m;
  } else {
    const d = new Date(latestDate);
    year = d.getFullYear();
    month = d.getMonth() + 1;
  }

  const dailyReturns = await getDailyReturns(null, year, month);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="animate-in">
        <h1 className="text-2xl md:text-3xl font-bold">리포트</h1>
        <p className="text-gray-400 mt-1">수익률 달력 · 뉴스 · 코멘터리 · 투자자 일기</p>
      </div>

      <ReportsContent
        key={`${year}-${month}`}
        dailyReturns={dailyReturns}
        year={year}
        month={month}
      />
    </div>
  );
}
