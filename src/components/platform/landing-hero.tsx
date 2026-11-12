"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Server } from "lucide-react";
import { DotGrid } from "@/components/platform/dot-grid";
import { LandingHeroLogo } from "@/components/platform/landing-hero-logo";
import { staggerContainer, staggerItem } from "@/lib/motion";

type LandingHeroProps = {
  domainLabel: string;
};

const CHIPS = ["웹 스토어", "Discord 패널", "자동 입금", "상품 발송"] as const;

const heroStagger = {
  ...staggerContainer,
  variants: {
    animate: {
      transition: { staggerChildren: 0.07, delayChildren: 0.35 },
    },
  },
};

export function LandingHero({ domainLabel }: LandingHeroProps) {
  return (
    <section
      id="hero"
      className="relative flex min-h-[min(100dvh-3.5rem,820px)] items-center justify-center overflow-hidden px-4 pb-16 pt-6 sm:min-h-[calc(100vh-64px)] sm:px-6 sm:pb-0 sm:pt-0"
    >
      <DotGrid />
      <LandingHeroLogo />

      <motion.div
        className="relative z-10 mx-auto max-w-4xl text-center"
        {...heroStagger}
        initial="initial"
        animate="animate"
      >
        <motion.div {...staggerItem}>
          <Link
            href="#features"
            className="quartz-card landing-shimmer inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] text-neutral-300 transition hover:border-white/20 sm:px-4 sm:py-2 sm:text-sm"
          >
            디지털 자판기 플랫폼
            <ArrowUpRight className="size-3.5 sm:size-4" />
          </Link>
        </motion.div>

        <motion.h1
          {...staggerItem}
          className="mt-5 text-[2.35rem] font-semibold leading-[1.12] tracking-tighter sm:mt-6 sm:text-6xl md:text-7xl md:leading-[1.12]"
        >
          차세대 웹자판기,
          <br className="sm:hidden" />
          <span className="text-gradient"> DOES</span>
        </motion.h1>

        <motion.p
          {...staggerItem}
          className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-foreground/80 sm:mt-6 sm:max-w-2xl sm:text-base md:text-lg"
        >
          라이선스 키 한 장으로 나만의 자판기를 열어요.
          <br className="hidden sm:block" />
          웹스토어 · Discord 패널 · 자동 입금까지.
        </motion.p>

        <motion.div
          {...staggerItem}
          className="mt-8 flex w-full flex-col items-stretch justify-center gap-3 sm:mt-12 sm:w-auto sm:flex-row sm:items-center sm:gap-4"
        >
          <Link
            href="/activate"
            className="landing-btn vx-btn-press min-h-12 justify-center gap-2 rounded-full px-6 text-base"
          >
            상점 등록
            <Server className="size-5" />
          </Link>
          <Link
            href="#features"
            className="landing-btn-outline vx-btn-press min-h-12 justify-center gap-2 rounded-full px-6 text-base shadow-none"
          >
            기능 알아보기
          </Link>
        </motion.div>

        <motion.div
          {...staggerItem}
          className="mt-7 hidden flex-wrap items-center justify-center gap-2 sm:mt-10 sm:flex"
        >
          {CHIPS.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[12px] font-medium text-neutral-400"
            >
              {chip}
            </span>
          ))}
        </motion.div>

        <motion.p
          {...staggerItem}
          className="mt-6 font-mono text-[11px] text-neutral-500 sm:mt-8 sm:text-xs"
        >
          your-shop.{domainLabel}
        </motion.p>
      </motion.div>

      <div aria-hidden className="pointer-events-none absolute bottom-0 left-0 z-0 w-full leading-none">
        <svg
          viewBox="0 24 150 28"
          preserveAspectRatio="none"
          className="relative block h-14 w-full min-h-14 sm:h-20 sm:min-h-20 md:h-[18vh] md:min-h-[100px]"
        >
          <defs>
            <path
              id="vendix-wave"
              d="M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z"
            />
          </defs>
          <g className="hero-wave-layer hero-wave-slow opacity-30">
            <use href="#vendix-wave" x="48" y="0" fill="rgba(255,255,255,0.08)" />
          </g>
          <g className="hero-wave-layer hero-wave-medium opacity-40">
            <use href="#vendix-wave" x="48" y="3" fill="rgba(255,255,255,0.05)" />
          </g>
          <g className="hero-wave-layer hero-wave-base opacity-60">
            <use href="#vendix-wave" x="48" y="7" fill="rgba(255,255,255,0.03)" />
          </g>
        </svg>
      </div>
    </section>
  );
}
