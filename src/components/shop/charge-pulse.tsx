"use client";

import { cn } from "@/lib/utils";

export function ChargePulse({
  active = true,
  size = 112,
  label,
  sublabel,
  className,
}: {
  active?: boolean;
  size?: number;
  label?: string;
  sublabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("charge-pulse-wrap relative mx-auto flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      aria-hidden={!label}
    >
      {active ? (
        <>
          <span className="charge-pulse-ring" style={{ animationDelay: "0s" }} />
          <span className="charge-pulse-ring" style={{ animationDelay: "0.65s" }} />
          <span className="charge-pulse-ring" style={{ animationDelay: "1.3s" }} />
        </>
      ) : null}
      <span className="charge-pulse-core" />
      {label ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300/90">
            {label}
          </span>
          {sublabel ? <span className="mt-0.5 text-[10px] text-emerald-200/70">{sublabel}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
