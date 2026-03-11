import {
  SkeletonText,
  SkeletonCard,
  SkeletonTable,
  SkeletonBox,
} from "@/components/Skeleton";

export default function HomeLoading() {
  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <div>
        <SkeletonText width="w-56" height="h-7 md:h-8" />
        <SkeletonText width="w-32" height="h-4" className="mt-2" />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* Rankings Table */}
      <SkeletonTable
        headers={["순위", "투자자", "총자산", "수익률", "오늘 실행"]}
        rows={7}
      />

      {/* Chart */}
      <div className="glass-card p-4 md:p-5">
        <SkeletonText width="w-24" height="h-5" className="mb-3" />
        <SkeletonBox height="h-[250px] md:h-[350px]" />
      </div>

      {/* Market + News */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <SkeletonTable
          headers={["종목", "현재가", "등락률"]}
          rows={5}
        />
        <div className="glass-card overflow-hidden">
          <div className="py-4 px-4 border-b border-white/5">
            <SkeletonText width="w-28" height="h-6" />
          </div>
          <div className="p-4 md:p-5 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-lg bg-white/[0.02] p-3 space-y-2">
                <SkeletonText width="w-3/4" height="h-4" />
                <SkeletonText width="w-full" height="h-3" />
                <div className="flex gap-2">
                  <SkeletonBox width="w-14" height="h-5" />
                  <SkeletonText width="w-16" height="h-3" className="mt-1" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
