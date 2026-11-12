"use client";

import {
  CreditCard,
  Globe,
  KeyRound,
  Package,
  ShoppingBag,
  Sparkles,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type FloatingIcon = {
  Icon: LucideIcon;
  position: string;
  motion: "a" | "b" | "c";
  delay: string;
  size?: "sm" | "md";
};

const FLOATING_ICONS: FloatingIcon[] = [
  { Icon: ShoppingBag, position: "left-[4%] top-[12%]", motion: "a", delay: "0s", size: "md" },
  { Icon: CreditCard, position: "right-[6%] top-[18%]", motion: "b", delay: "0.8s", size: "sm" },
  { Icon: KeyRound, position: "left-[10%] bottom-[22%]", motion: "c", delay: "1.2s", size: "sm" },
  { Icon: Package, position: "right-[12%] bottom-[28%]", motion: "a", delay: "0.4s", size: "md" },
  { Icon: Globe, position: "left-[28%] top-[6%]", motion: "b", delay: "1.6s", size: "sm" },
  { Icon: Zap, position: "right-[22%] top-[8%]", motion: "c", delay: "0.2s", size: "sm" },
  { Icon: Sparkles, position: "right-[4%] bottom-[12%]", motion: "b", delay: "2s", size: "sm" },
];

export function LandingFloatingIcons() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {FLOATING_ICONS.map(({ Icon, position, motion, delay, size }) => (
        <div
          key={position + motion}
          className={`absolute ${position} landing-icon-float-${motion}`}
          style={{ animationDelay: delay }}
        >
          <div
            className={`landing-icon-chip ${size === "sm" ? "landing-icon-chip-sm" : ""}`}
          >
            <Icon className={size === "sm" ? "size-4" : "size-5"} strokeWidth={1.75} />
          </div>
        </div>
      ))}
    </div>
  );
}
