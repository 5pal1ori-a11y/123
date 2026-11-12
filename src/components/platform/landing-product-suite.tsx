"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BadgeCheck,
  MessageSquare,
  Shield,
  Store,
} from "lucide-react";
import { FadeIn } from "@/components/platform/fade-in";
import {
  getRootDomain,
  securityOrigin,
  ticketOrigin,
  verifyOrigin,
} from "@/lib/domain";

type ProductCard = {
  id: string;
  title: string;
  eyebrow: string;
  desc: string;
  href: string;
  Icon: typeof Store;
  accent: string;
  soft: string;
  border: string;
  preview: "shop" | "ticket" | "security" | "verify";
  previewAccent: string;
};

function resolvePort() {
  if (typeof window === "undefined") return "3000";
  const root = getRootDomain();
  if (root === "localhost" || window.location.hostname.includes("localhost")) {
    return window.location.port || "3000";
  }
  return "3000";
}

function buildCards(port: string): ProductCard[] {
  return [
    {
      id: "shop",
      title: "웹 자판기",
      eyebrow: "Store",
      desc: "서브도메인 상점 · 입금 · 재고 · Discord 패널",
      href: "/activate",
      Icon: Store,
      accent: "text-amber-200",
      soft: "from-amber-500/18 via-white/[0.03] to-transparent",
      border: "border-white/14 hover:border-amber-300/40",
      preview: "shop",
      previewAccent: "bg-amber-400/40",
    },
    {
      id: "ticket",
      title: "티켓 봇",
      eyebrow: "Ticket",
      desc: "문의 티켓 · 매크로 · 기록 · 웹 패널",
      href: ticketOrigin(port),
      Icon: MessageSquare,
      accent: "text-sky-300",
      soft: "from-sky-500/20 via-cyan-500/5 to-transparent",
      border: "border-sky-400/25 hover:border-sky-300/45",
      preview: "ticket",
      previewAccent: "bg-sky-400/35",
    },
    {
      id: "security",
      title: "시큐리티 봇",
      eyebrow: "Security",
      desc: "레이드 · 스팸 · 입장 필터 · 보호",
      href: securityOrigin(port),
      Icon: Shield,
      accent: "text-rose-300",
      soft: "from-rose-500/20 via-orange-500/5 to-transparent",
      border: "border-rose-400/25 hover:border-rose-300/45",
      preview: "security",
      previewAccent: "bg-rose-400/40",
    },
    {
      id: "verify",
      title: "인증 봇",
      eyebrow: "Verify",
      desc: "멤버 인증 · VPN 차단 · 로그 · Turnstile",
      href: verifyOrigin(port),
      Icon: BadgeCheck,
      accent: "text-emerald-300",
      soft: "from-emerald-500/20 via-teal-500/5 to-transparent",
      border: "border-emerald-400/25 hover:border-emerald-300/45",
      preview: "verify",
      previewAccent: "bg-emerald-400/40",
    },
  ];
}

function PreviewMock({
  kind,
  accent,
}: {
  kind: ProductCard["preview"];
  accent: string;
}) {
  if (kind === "shop") {
    return (
      <div className="space-y-2 p-3">
        <div className="flex gap-2">
          <span className="h-8 flex-1 rounded-lg bg-white/10" />
          <span className={`h-8 w-16 rounded-lg ${accent}`} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <span className="h-14 rounded-xl bg-white/[0.07]" />
          <span className="h-14 rounded-xl bg-white/[0.07]" />
        </div>
        <div className="h-2 w-3/4 rounded-full bg-white/15" />
      </div>
    );
  }
  if (kind === "ticket") {
    return (
      <div className="space-y-2 p-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-2.5 py-2">
            <span className={`size-6 rounded-lg ${accent}`} />
            <span className="h-2 flex-1 rounded-full bg-white/15" />
            <span className="h-5 w-10 rounded-md bg-white/10" />
          </div>
        ))}
      </div>
    );
  }
  if (kind === "security") {
    return (
      <div className="space-y-2 p-3">
        <div className="grid grid-cols-3 gap-2">
          {["레이드", "스팸", "입장"].map((t) => (
            <div key={t} className="rounded-xl bg-white/[0.06] px-2 py-2.5 text-center">
              <span className={`mx-auto mb-1.5 block size-5 rounded-md ${accent}`} />
              <span className="text-[9px] text-white/50">{t}</span>
            </div>
          ))}
        </div>
        <div className="h-8 rounded-xl bg-rose-400/15 ring-1 ring-rose-400/20" />
      </div>
    );
  }
  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center gap-2 rounded-xl bg-emerald-400/10 px-3 py-2.5 ring-1 ring-emerald-400/20">
        <span className={`size-7 rounded-full ${accent}`} />
        <div className="min-w-0 flex-1 space-y-1">
          <span className="block h-2 w-20 rounded-full bg-white/20" />
          <span className="block h-1.5 w-14 rounded-full bg-white/10" />
        </div>
        <span className="rounded-md bg-emerald-400/30 px-2 py-1 text-[9px] font-semibold text-emerald-100">
          OK
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-white/10" />
      <div className="h-2 w-2/3 rounded-full bg-white/10" />
    </div>
  );
}

export function LandingProductSuite() {
  const cards = useMemo(() => buildCards(resolvePort()), []);

  return (
    <section id="suite" className="relative overflow-hidden py-16 md:py-24">
      <motion.div
        className="pointer-events-none absolute left-1/2 top-0 h-64 w-[70%] -translate-x-1/2 rounded-full bg-white/[0.04] blur-3xl"
        animate={{ opacity: [0.25, 0.5, 0.25], scale: [1, 1.05, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 md:px-10">
        <FadeIn className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
            Product suite
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
            자판기부터 봇까지
            <br />
            <span className="text-gradient">한 플랫폼</span>
          </h2>
          <p className="mt-3 text-text-secondary">
            웹 자판기 · 티켓 · 시큐리티 · 인증 — 각각 전용 패널로 바로 들어가 보세요.
          </p>
        </FadeIn>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {cards.map((card, i) => (
            <FadeIn key={card.id} delay={i * 80}>
              <motion.div whileHover={{ y: -5 }} transition={{ type: "spring", stiffness: 360, damping: 24 }}>
                <Link
                  href={card.href}
                  className={`group relative flex h-full flex-col overflow-hidden rounded-[1.5rem] border bg-gradient-to-b ${card.soft} ${card.border} transition`}
                >
                  <div className="flex items-start justify-between gap-3 px-5 pt-5">
                    <div className="flex items-center gap-3">
                      <motion.span
                        className={`flex size-10 items-center justify-center rounded-2xl bg-black/30 ring-1 ring-white/10 ${card.accent}`}
                        whileHover={{ rotate: [-6, 6, 0], scale: 1.06 }}
                        transition={{ duration: 0.4 }}
                      >
                        <card.Icon className="size-5" strokeWidth={1.75} />
                      </motion.span>
                      <div>
                        <p className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${card.accent}`}>
                          {card.eyebrow}
                        </p>
                        <h3 className="mt-0.5 text-lg font-semibold tracking-tight">{card.title}</h3>
                      </div>
                    </div>
                    <span className="flex size-8 items-center justify-center rounded-full bg-white/5 text-neutral-400 ring-1 ring-white/10 transition group-hover:bg-white/10 group-hover:text-white">
                      <ArrowUpRight className="size-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </span>
                  </div>
                  <p className="mt-3 px-5 text-sm leading-relaxed text-text-secondary">{card.desc}</p>
                  <div className="mx-5 mb-5 mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/35 shadow-inner">
                    <div className="flex items-center gap-1.5 border-b border-white/[0.08] px-3 py-2">
                      <span className="size-1.5 rounded-full bg-white/25" />
                      <span className="size-1.5 rounded-full bg-white/25" />
                      <span className="size-1.5 rounded-full bg-white/25" />
                      <span className="ml-2 font-mono text-[9px] text-white/30">preview</span>
                    </div>
                    <PreviewMock kind={card.preview} accent={card.previewAccent} />
                  </div>
                </Link>
              </motion.div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
