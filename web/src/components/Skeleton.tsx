export function SkeletonText({
  width = "w-24",
  height = "h-4",
  className = "",
}: {
  width?: string;
  height?: string;
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse rounded bg-white/[0.06] ${width} ${height} ${className}`}
    />
  );
}

export function SkeletonBox({
  width = "w-full",
  height = "h-40",
  className = "",
}: {
  width?: string;
  height?: string;
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-white/[0.06] ${width} ${height} ${className}`}
    />
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`glass-card p-5 space-y-2 ${className}`}>
      <SkeletonText width="w-20" height="h-3" />
      <SkeletonText width="w-32" height="h-7" />
    </div>
  );
}

export function SkeletonTableRow({ cols = 4 }: { cols?: number }) {
  return (
    <tr className="border-b border-white/5">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="py-3 px-4">
          <SkeletonText width={i === 0 ? "w-20" : "w-16"} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({
  cols = 4,
  rows = 5,
  headers,
}: {
  cols?: number;
  rows?: number;
  headers?: string[];
}) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400 text-xs uppercase tracking-wider">
              {(headers ?? Array.from({ length: cols })).map((h, i) => (
                <th key={i} className="py-3 px-4 text-left">
                  {typeof h === "string" ? (
                    h
                  ) : (
                    <SkeletonText width="w-12" height="h-3" />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <SkeletonTableRow key={i} cols={headers?.length ?? cols} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
