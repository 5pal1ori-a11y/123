export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-white/[0.06] ${className}`}
      aria-hidden
    />
  );
}

export function AdminDashboardSkeleton() {
  return (
    <div className="space-y-4 p-4 sm:p-6" role="status" aria-live="polite" aria-label="불러오는 중">
      <Skeleton className="h-40 w-full rounded-3xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <Skeleton className="h-56 lg:col-span-7" />
        <Skeleton className="h-56 lg:col-span-5" />
      </div>
      <span className="sr-only">대시보드를 불러오는 중</span>
    </div>
  );
}

export function PanelListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="목록 불러오는 중">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}
