"use client";

import type { ReactNode } from "react";

export function AdminHero({
  badge,
  value,
  hint,
  stats,
  className = "lg:col-span-5",
  children,
}: {
  badge: string;
  value: ReactNode;
  hint?: string;
  stats?: { label: string; value: string }[];
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section className={`admin-hero relative overflow-hidden p-6 sm:p-8 ${className}`}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)",
          backgroundSize: "18px 18px",
        }}
      />
      <p className="admin-hero-badge relative">{badge}</p>
      <div
        className="relative mt-5 text-[2rem] font-black tracking-tight text-white sm:text-4xl"
        style={{ letterSpacing: "-0.05em" }}
      >
        {value}
      </div>
      {hint && <p className="relative mt-3 text-sm font-medium text-zinc-400">{hint}</p>}
      {stats && stats.length > 0 && (
        <div className="relative mt-8 grid grid-cols-2 gap-4 border-t border-white/10 pt-5 text-sm sm:grid-cols-3 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-[11px] font-medium text-zinc-500">{s.label}</p>
              <p className="mt-1 text-base font-extrabold tracking-tight text-zinc-100">{s.value}</p>
            </div>
          ))}
        </div>
      )}
      {children && <div className="relative mt-5">{children}</div>}
    </section>
  );
}

export function AdminStat({
  label,
  value,
  hint,
  className = "lg:col-span-3",
  tone,
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  className?: string;
  tone?: "warn" | "ok";
  children?: ReactNode;
}) {
  const color =
    tone === "warn" ? "text-orange-400" : tone === "ok" ? "text-emerald-400" : undefined;
  return (
    <section className={`admin-bento flex flex-col justify-between p-5 ${className}`}>
      <div>
        <p className="text-xs font-medium" style={{ color: "var(--ad-muted)" }}>
          {label}
        </p>
        <p className={`mt-2 text-2xl font-extrabold tracking-tight ${color ?? ""}`}>
          {value}
        </p>
        {hint && (
          <p className="mt-2 text-xs" style={{ color: "var(--ad-muted)" }}>
            {hint}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

export function AdminPane({
  title,
  action,
  className = "lg:col-span-12",
  children,
}: {
  title?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`admin-bento p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h3 className="text-[17px] font-extrabold tracking-tight">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
