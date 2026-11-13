"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Mountain, Store, TreePine, Users } from "lucide-react";
import { useShopUser } from "@/components/shop/user-context";
import { VendixLogo } from "@/components/ui/vendix-logo";
import { shopPath, useShopBase } from "@/lib/shop-nav";
import type { LandingScene } from "./landing-scene";

const FEATURES = [
  { icon: Users, title: "메인 광장", body: "다른 유저들과 만나서 채팅하고, 미니게임과 결투를 즐겨요" },
  { icon: Mountain, title: "야생 서버", body: "모두가 같은 월드에서 캐고, 짓고, 살아남는 멀티 생존" },
  { icon: TreePine, title: "나만의 섬", body: "블록을 모아 내 섬을 꾸미면 친구들이 놀러 올 수 있어요" },
];

const ease = [0.22, 1, 0.36, 1] as const;

export function ShopLanding({ shopName }: { shopName: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const { user } = useShopUser();
  const base = useShopBase();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let scene: LandingScene | null = null;
    let cancelled = false;
    import("./landing-scene")
      .then(({ LandingScene: Scene }) => {
        if (cancelled) return;
        try {
          scene = new Scene(host, () => setSceneReady(true));
        } catch (err) {
          console.error("[landing] webgl init failed", err);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      scene?.dispose();
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#050508] text-white">
      <div
        ref={hostRef}
        aria-hidden
        className={`absolute inset-0 transition-[opacity,transform] duration-[1600ms] ease-out ${sceneReady ? "scale-100 opacity-100" : "scale-[1.04] opacity-0"}`}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_60%_at_50%_42%,rgba(5,5,8,0.28),rgba(5,5,8,0.6)_70%,rgba(5,5,8,0.88))]"
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-[#050508] via-[#050508]/70 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#050508]/80 to-transparent" />

      <div className="relative flex h-full flex-col overflow-y-auto">
        <header className="flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+2.6rem)] sm:px-10 sm:pt-[max(1.25rem,env(safe-area-inset-top))]">
          <Link href={shopPath(base, "/")} className="flex items-center gap-2.5 no-underline">
            <VendixLogo size={30} priority />
            <span className="font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-tight text-white">{shopName}</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              href={shopPath(base, "/dashboard")}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3.5 text-[13px] font-medium text-white/80 no-underline backdrop-blur-md transition hover:border-white/25 hover:text-white"
            >
              <Store className="size-3.5" />
              상점
            </Link>
            {user ? null : (
              <Link
                href={shopPath(base, "/dashboard")}
                className="inline-flex h-9 items-center rounded-full bg-white/90 px-4 text-[13px] font-semibold text-[#0a0a0f] no-underline transition hover:bg-white"
              >
                로그인
              </Link>
            )}
          </nav>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center px-5 py-14 text-center">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease }}
            className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/30 px-3.5 py-1.5 font-[family-name:var(--font-jetbrains)] text-[10.5px] uppercase tracking-[0.32em] text-white/70 backdrop-blur-md"
          >
            <span className="size-1.5 rounded-full bg-[#4ade80] shadow-[0_0_10px_#4ade80]" />
            Minecraft World
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ delay: 0.1, duration: 1, ease }}
            className="mt-6 font-[family-name:var(--font-dohyeon)] text-[clamp(2.6rem,9vw,6.4rem)] leading-[1.08] tracking-[-0.01em] text-white [text-shadow:0_4px_40px_rgba(0,0,0,0.55)]"
          >
            마인크래프트 세계에
            <br />
            <span className="bg-gradient-to-r from-[#5ef0e6] via-[#7dfcb0] to-[#4ade80] bg-clip-text text-transparent">여러분을 초대합니다.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.8, ease }}
            className="mt-6 max-w-xl text-[15px] leading-relaxed text-white/70 sm:text-base [text-shadow:0_2px_16px_rgba(0,0,0,0.6)]"
          >
            설치 없이 브라우저에서 바로 들어가는 {shopName} 마인크래프트 월드.
            <br className="hidden sm:block" /> 광장에서 친구들을 만나고, 야생 서버에서 함께 살아남고, 나만의 섬을 꾸며보세요.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8, ease }}
            className="mt-9 flex items-center justify-center"
          >
            {/* 로그인 없이 게스트로 바로 상점에 들어간다 (구매·출석 등은 그때 로그인 안내) */}
            <Link
              href={shopPath(base, "/dashboard?tab=products")}
              className="group relative inline-flex h-14 items-center gap-2.5 overflow-hidden rounded-2xl bg-white px-10 text-[17px] font-bold text-[#0a0a0f] no-underline shadow-[0_18px_50px_-12px_rgba(94,240,230,0.55)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-12px_rgba(94,240,230,0.7)]"
            >
              <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[#5ef0e6]/35 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <Store className="relative size-5" />
              <span className="relative">상점 가기</span>
            </Link>
          </motion.div>
        </main>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.9, ease }}
          className="mx-auto grid w-full max-w-4xl gap-3 px-5 pb-[max(2rem,env(safe-area-inset-bottom))] sm:grid-cols-3 sm:px-10"
        >
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-white/[0.08] bg-[#0e0e14]/70 p-4 text-left backdrop-blur-xl">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-xl bg-white/[0.06] text-[#5ef0e6]">
                  <Icon className="size-4" />
                </span>
                <b className="text-[14px] font-semibold text-white">{title}</b>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">{body}</p>
            </div>
          ))}
        </motion.section>
      </div>
    </div>
  );
}
