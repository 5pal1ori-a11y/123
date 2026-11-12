"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function ChargeOrb({
  active = true,
  amountLabel,
  subLabel,
  size = "lg",
  className,
}: {
  active?: boolean;
  amountLabel?: string;
  subLabel?: string;
  size?: "sm" | "lg" | "xl";
  className?: string;
}) {
  const dim = size === "xl" ? 200 : size === "lg" ? 148 : 96;

  return (
    <div
      className={cn("charge-orb relative mx-auto flex items-center justify-center", className)}
      style={{ width: dim, height: dim }}
    >
      <div className="charge-orb-glow" aria-hidden />
      {active ? (
        <>
          <span className="charge-orb-ring" style={{ animationDelay: "0s" }} />
          <span className="charge-orb-ring" style={{ animationDelay: "0.55s" }} />
          <span className="charge-orb-ring" style={{ animationDelay: "1.1s" }} />
          <span className="charge-orb-ring charge-orb-ring-slow" style={{ animationDelay: "0.25s" }} />
        </>
      ) : null}
      <div className="charge-orb-core">
        {amountLabel ? (
          <div className="relative z-[2] px-3 text-center">
            <p className="charge-orb-amount">{amountLabel}</p>
            {subLabel ? <p className="charge-orb-sub">{subLabel}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ChargeStepRail({
  steps,
  current,
}: {
  steps: { id: string; label: string }[];
  current: number;
}) {
  const progress = steps.length <= 1 ? 0 : ((current - 1) / (steps.length - 1)) * 100;

  return (
    <div className="charge-step-rail">
      <div className="charge-step-rail-track">
        <motion.div
          className="charge-step-rail-fill"
          initial={false}
          animate={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 22 }}
        />
      </div>
      <div className="charge-step-rail-nodes">
        {steps.map((step, i) => {
          const idx = i + 1;
          const state = idx < current ? "done" : idx === current ? "active" : "idle";
          return (
            <div key={step.id} className={cn("charge-step-node", `is-${state}`)}>
              <span className="charge-step-dot">{idx < current ? "✓" : idx}</span>
              <span className="charge-step-label">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChargeStudioShell({
  children,
  embedded,
}: {
  children: React.ReactNode;
  embedded?: boolean;
}) {
  return (
    <div className={cn("charge-studio", embedded && "charge-studio-embedded")}>
      <div className="charge-studio-bg" aria-hidden>
        <div className="charge-studio-mesh charge-studio-mesh-a" />
        <div className="charge-studio-mesh charge-studio-mesh-b" />
        <div className="charge-studio-grid" />
      </div>
      <div className="charge-studio-content">{children}</div>
    </div>
  );
}
