"use client";

import { buildPlanUsage, formatPlanLabel, type PlanUsageRow } from "@/lib/plans";
import type { LicensePlan } from "@/lib/types";

export function PlanLimitUsageBars({
  plan,
  productCount,
  categoryCount,
  compact = false,
}: {
  plan: LicensePlan;
  productCount: number;
  categoryCount: number;
  compact?: boolean;
}) {
  const rows = buildPlanUsage(plan, {
    products: productCount,
    categories: categoryCount,
  });

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {!compact ? (
        <p className="text-xs text-neutral-500">
          현재 플랜 <span className="font-semibold text-neutral-300">{formatPlanLabel(plan)}</span>{" "}
          한도
        </p>
      ) : null}
      {rows.map((row) => (
        <PlanUsageBar key={row.kind} row={row} compact={compact} />
      ))}
    </div>
  );
}

function PlanUsageBar({ row, compact }: { row: PlanUsageRow; compact?: boolean }) {
  const label = row.unlimited
    ? `${row.label} ${row.current} · 무제한`
    : `${row.label} ${row.current} / ${row.limit}`;
  const pct = row.pct ?? 0;
  const color =
    !row.unlimited && row.limit != null && row.current >= row.limit
      ? "bg-red-500"
      : row.nearLimit
        ? "bg-amber-400"
        : "bg-neutral-500";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-neutral-400">{label}</span>
        {!row.unlimited && row.remaining != null ? (
          <span className={row.nearLimit ? "text-amber-300" : "text-neutral-500"}>
            남은 {row.remaining}개
          </span>
        ) : null}
      </div>
      <div className={`overflow-hidden rounded-full bg-white/10 ${compact ? "h-1.5" : "h-2"}`}>
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: row.unlimited ? "12%" : `${Math.max(4, pct)}%` }}
          role="progressbar"
          aria-valuenow={row.current}
          aria-valuemin={0}
          aria-valuemax={row.limit ?? row.current}
          aria-label={label}
        />
      </div>
    </div>
  );
}
