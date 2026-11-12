"use client";

import { AnimatePresence, motion } from "framer-motion";
import { fadeUp, vxTransition } from "@/lib/motion";

export type StatItem = {
  label: string;
  value: string | number;
  warn?: boolean;
};

export function PanelStats({ items }: { items: StatItem[] }) {
  const cols =
    items.length <= 2
      ? "sm:grid-cols-2"
      : items.length === 3
        ? "sm:grid-cols-3 lg:grid-cols-3"
        : "sm:grid-cols-2 lg:grid-cols-4";
  return (
    <div className={`grid gap-3 ${cols}`}>
      {items.map((s) => (
        <div key={s.label} className="admin-bento flex flex-col justify-center px-5 py-4">
          <p className="text-xs text-neutral-500">{s.label}</p>
          <p
            className={`mt-1 text-2xl font-bold tracking-tight ${
              s.warn ? "text-orange-400" : "text-white"
            }`}
          >
            {s.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function PanelFrame({
  stats,
  tabs,
  activeTab,
  onTabChange,
  children,
}: {
  stats?: StatItem[];
  tabs: { id: string; label: string }[];
  activeTab: string;
  onTabChange: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      {stats && stats.length > 0 ? <PanelStats items={stats} /> : null}
      <div className="admin-bento p-4 sm:p-5">
        <div className="admin-chip-row" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              className={`admin-chip ${activeTab === t.id ? "is-on" : ""}`}
              onClick={() => onTabChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">{children}</AnimatePresence>
      </div>
    </div>
  );
}

export function PanelTabBody({
  tabKey,
  children,
  className = "mt-5 space-y-4",
}: {
  tabKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      key={tabKey}
      className={className}
      initial={fadeUp.initial}
      animate={fadeUp.animate}
      exit={fadeUp.exit}
      transition={vxTransition}
    >
      {children}
    </motion.div>
  );
}

export function PanelField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-neutral-500">
        {label}
        {hint ? <span className="text-neutral-600"> · {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function PanelEmpty({
  message,
  action,
}: {
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 py-10 text-center">
      <p className="text-sm text-neutral-500">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PanelList({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ul
      className={`divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] ${className}`}
    >
      {children}
    </ul>
  );
}

export function PanelRow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <li
      className={`flex items-center gap-3 px-3 py-3 transition hover:bg-white/[0.03] sm:gap-4 sm:px-4 ${className}`}
    >
      {children}
    </li>
  );
}

export function PanelPrimaryBtn({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-2xl border border-white/12 bg-white/[0.08] px-5 py-3 text-[15px] font-semibold text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35 vx-btn-press ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
