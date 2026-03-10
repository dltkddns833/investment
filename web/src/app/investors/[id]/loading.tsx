import {
  SkeletonText,
  SkeletonCard,
  SkeletonTable,
  SkeletonBox,
} from "@/components/Skeleton";

export default function InvestorLoading() {
  return (
    <div className="space-y-8">
      {/* Hero Header */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-transparent p-6 lg:p-8 border border-white/5">
        <SkeletonText width="w-40" height="h-8" />
        <SkeletonText width="w-48" height="h-4" className="mt-2" />
        <SkeletonText width="w-72" height="h-4" className="mt-2" />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* Analysis Criteria */}
      <div className="glass-card p-5">
        <SkeletonText width="w-24" height="h-5" className="mb-3" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonBox key={i} width="w-20" height="h-7" className="rounded-full" />
          ))}
        </div>
      </div>

      {/* Chart + Allocation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-5">
          <SkeletonText width="w-32" height="h-5" className="mb-3" />
          <SkeletonBox height="h-[300px]" />
        </div>
        <div className="glass-card p-5">
          <SkeletonText width="w-24" height="h-5" className="mb-3" />
          <SkeletonText width="w-full" height="h-3" className="mb-4" />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <SkeletonText width="w-24" height="h-4" />
                <div className="w-32 bg-gray-700/50 rounded-full h-2">
                  <div
                    className="animate-pulse bg-white/[0.06] h-2 rounded-full"
                    style={{ width: `${60 - i * 8}%` }}
                  />
                </div>
                <SkeletonText width="w-10" height="h-4" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Holdings Table */}
      <SkeletonTable
        headers={["종목", "수량", "평균단가", "현재가", "평가금", "수익률"]}
        rows={5}
      />

      {/* Transaction Table */}
      <SkeletonTable
        headers={["날짜", "유형", "종목", "수량", "단가", "금액"]}
        rows={5}
      />
    </div>
  );
}
