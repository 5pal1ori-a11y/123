"use client";

import { useRef } from "react";
import { CreditCard, KeyRound, Package } from "lucide-react";
import { VendixLogo } from "@/components/ui/vendix-logo";

const ORBIT_ICONS = [
  { Icon: Package, position: "-left-3 top-1/4", motion: "a" as const, delay: "0s" },
  { Icon: KeyRound, position: "-right-2 top-1/3", motion: "b" as const, delay: "0.6s" },
  { Icon: CreditCard, position: "bottom-8 -right-4", motion: "c" as const, delay: "1.1s" },
];

export function QuartzPreview() {
  const card = useRef<HTMLDivElement>(null);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const node = card.current;
    if (!node) return;
    const r = node.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    node.style.transform = `perspective(900px) rotateY(${px * 10}deg) rotateX(${-py * 8}deg)`;
  }

  function onLeave() {
    const node = card.current;
    if (!node) return;
    node.style.transform = "perspective(900px) rotateY(0deg) rotateX(0deg)";
  }

  return (
    <div className="relative" onMouseMove={onMove} onMouseLeave={onLeave}>
      {ORBIT_ICONS.map(({ Icon, position, motion, delay }) => (
        <div
          key={position}
          aria-hidden
          className={`absolute z-20 hidden sm:block ${position} landing-icon-float-${motion}`}
          style={{ animationDelay: delay }}
        >
          <div className="landing-icon-chip landing-icon-chip-sm shadow-lg shadow-black/20">
            <Icon className="size-4" strokeWidth={1.75} />
          </div>
        </div>
      ))}
      <div
        aria-hidden
        className="absolute -inset-1 rounded-[2rem] opacity-40 blur-2xl"
        style={{
          background:
            "radial-gradient(600px 200px at 60% 30%, rgba(95,122,114,.18), transparent 60%)",
        }}
      />
      <div
        ref={card}
        className="quartz-card landing-shadow overflow-hidden border border-white/10 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
      >
        <div className="relative flex aspect-[4/3] items-center justify-center bg-[linear-gradient(180deg,#0a0a0a_0%,#111_100%)]">
          <span className="absolute left-4 top-4 font-mono text-[10px] uppercase tracking-[0.28em] text-neutral-500">
            PREVIEW
          </span>
          <VendixLogo size={160} priority className="logo-float" />
        </div>
      </div>
      <p className="mt-4 text-right text-sm text-neutral-500">* 프리뷰</p>
    </div>
  );
}
