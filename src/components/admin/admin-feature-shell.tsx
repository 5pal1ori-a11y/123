"use client";

import type { LucideIcon } from "lucide-react";
import { PanelEmpty, PanelPrimaryBtn } from "./admin-panel-ui";

export function AdminFeatureShell({
  title,
  description,
  icon: Icon,
  bullets,
  ctaLabel,
  onCta,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  bullets?: string[];
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <div className="admin-bento space-y-5 p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-[var(--ad-accent-soft)] text-[var(--ad-accent)]">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-tight text-white">{title}</h3>
          <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-neutral-400">
            {description}
          </p>
        </div>
      </div>

      {bullets && bullets.length > 0 ? (
        <ul className="space-y-2 rounded-[10px] border border-white/8 bg-black/20 px-4 py-3">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2 text-[13px] text-neutral-400">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--ad-accent)]" />
              {b}
            </li>
          ))}
        </ul>
      ) : null}

      <PanelEmpty
        message="이 기능은 곧 확장될 예정이에요"
        action={
          ctaLabel && onCta ? (
            <PanelPrimaryBtn className="px-6" onClick={onCta}>
              {ctaLabel}
            </PanelPrimaryBtn>
          ) : undefined
        }
      />
    </div>
  );
}
