"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Layers } from "lucide-react";
import type { ProductWithStock } from "@/lib/types";
import { shopPath, useShopBase } from "@/lib/shop-nav";

/** 「MFA 상품」 으로 묶인 마크 계정들을 카드 하나로 보여 준다 — 누르면 상세에서 계정을 골라 산다 */
export function MfaGroupCard({ products, priceOf }: { products: ProductWithStock[]; priceOf: (p: ProductWithStock) => number }) {
  const base = useShopBase();
  if (!products.length) return null;
  const sorted = [...products].sort((a, b) => priceOf(a) - priceOf(b));
  const min = priceOf(sorted[0]);
  const faces = sorted.slice(0, 3);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mc-card mf-dark flex flex-col rounded-[14px] border bg-[#0b1020] p-3 transition hover:!border-white/70"
      style={{ borderColor: "rgba(129,140,248,0.55)", boxShadow: "0 0 0 1px rgba(129,140,248,0.25), 0 0 28px rgba(99,102,241,0.18)" }}
    >
      <Link href={shopPath(base, `/product/${sorted[0].slug}`)} className="flex flex-1 flex-col outline-none">
        <div className="relative h-[180px] overflow-hidden rounded-[10px] bg-[radial-gradient(circle_at_50%_30%,rgba(99,102,241,0.28),transparent_70%)] sm:h-[210px]">
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-center">
            {faces.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.id}
                src={`/api/mc-account/${encodeURIComponent(p.id)}?asset=skin&v=${encodeURIComponent(p.mcVersion ?? "0")}`}
                alt=""
                loading="lazy"
                className="h-[150px] w-auto object-contain object-bottom sm:h-[180px]"
                style={{
                  imageRendering: "pixelated",
                  marginLeft: i ? -46 : 0,
                  zIndex: 3 - Math.abs(i - 1),
                  transform: i === 1 ? "scale(1.08)" : "scale(0.92)",
                  filter: i === 1 ? undefined : "brightness(0.8)",
                }}
              />
            ))}
          </div>
          <span className="absolute left-0 top-0 z-10 inline-flex items-center gap-1 rounded-md border border-[rgba(129,140,248,0.5)] bg-[rgba(20,22,58,0.9)] px-2 py-1 text-[11px] font-bold leading-none text-[#c7d2fe]">
            <Layers className="size-3" /> MFA
          </span>
          <span className="absolute right-0 top-0 z-10 rounded-md bg-[rgba(0,0,0,0.6)] px-2 py-1 text-[11px] font-bold leading-none text-white">
            {products.length}개 계정
          </span>
          <span className="absolute bottom-0 right-0 z-10 inline-flex items-baseline gap-0.5 rounded-lg bg-white px-2 py-1 shadow-lg">
            <span className="text-[11px] font-bold text-neutral-500">₩</span>
            <span className="text-sm font-extrabold text-black">{min.toLocaleString("ko-KR")}</span>
            <span className="text-[11px] font-bold text-neutral-500">~</span>
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-extrabold text-white">MFA 마인크래프트 계정</p>
            <p className="mt-0.5 text-xs text-neutral-400">상세에서 닉네임 · 망토를 보고 골라 사요</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-indigo-500 px-2.5 py-1.5 text-xs font-bold text-white">
            고르기 <ChevronRight className="size-3.5" />
          </span>
        </div>
      </Link>
    </motion.li>
  );
}
