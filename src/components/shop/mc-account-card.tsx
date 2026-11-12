"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, ExternalLink, Heart, ShoppingCart, Star, User } from "lucide-react";
import type { ProductWithStock, StockStatus } from "@/lib/types";
import type { McAccountInfo, McCapeInfo } from "@/lib/mc-account";
import { shopPath, useShopBase } from "@/lib/shop-nav";

function timeAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금 전";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}일 전`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}개월 전`;
  return `${Math.floor(mo / 12)}년 전`;
}

/** 망토 텍스처에서 앞면(10x16)만 잘라서 픽셀 그대로 보여준다 */
function CapeIcon({ src, cape }: { src: string; cape: McCapeInfo }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.onload = () => alive && setSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => alive && setFailed(true);
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src]);

  if (failed) return null;

  const W = 14; // 표시 폭(px) — 앞면 10px 기준
  let style: React.CSSProperties = {};
  if (size) {
    const texScale = size.w / cape.baseWidth; // HD 망토 대응
    const k = W / (10 * texScale);
    style = {
      backgroundImage: `url(${src})`,
      backgroundSize: `${size.w * k}px ${size.h * k}px`,
      backgroundPosition: `${-texScale * k}px ${-texScale * k}px`,
      imageRendering: "pixelated",
    };
  }

  return (
    <span
      title={cape.source === "optifine" ? "옵티파인 망토" : "마인크래프트 망토"}
      className="flex h-[26px] w-[20px] items-center justify-center rounded-[4px] bg-white/[0.06] ring-1 ring-white/10"
    >
      <span className="block h-[22.4px] w-[14px] bg-no-repeat" style={style} />
    </span>
  );
}

export function McAccountCard({
  product,
  index,
  shopName,
  priceText,
  originalPriceText,
  stockStatus,
  sold,
  rating,
  wishlisted,
  onToggleWishlist,
  onAddToCart,
}: {
  product: ProductWithStock;
  index: number;
  shopName: string;
  priceText: string;
  originalPriceText?: string | null;
  stockStatus: StockStatus;
  sold: number;
  rating: number | null;
  wishlisted: boolean;
  onToggleWishlist: () => void;
  onAddToCart?: () => void;
}) {
  const base = useShopBase();
  const href = shopPath(base, `/product/${product.slug}`);
  const soldOut = stockStatus === "sold_out";
  const [info, setInfo] = useState<McAccountInfo | null>(null);
  const [skinFailed, setSkinFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/mc-account/${encodeURIComponent(product.id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<McAccountInfo>) : null))
      .then((d) => alive && setInfo(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [product.id]);

  const skinSrc = product.thumbnail?.trim() || `/api/mc-account/${encodeURIComponent(product.id)}?asset=skin`;
  const capes = info?.capes ?? [];
  const shownCapes = capes.slice(0, 6);
  const moreCapes = capes.length - shownCapes.length;
  const title = product.mcMaskedName || product.name;
  const tag = product.tags?.[0];

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.24), duration: 0.32 }}
      className={`mc-card flex flex-col rounded-[14px] border border-[#1c2436] bg-[#0b1020] p-3 ${
        soldOut ? "opacity-60" : ""
      }`}
    >
      {/* 스킨 영역 */}
      <div className="relative h-[210px] overflow-hidden rounded-[10px]">
        <Link href={href} className="absolute inset-0 flex items-end justify-center">
          {!skinFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={skinSrc}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full object-contain object-bottom"
              style={{ imageRendering: "pixelated" }}
              onError={() => setSkinFailed(true)}
            />
          ) : (
            <User className="mb-16 size-16 text-white/10" />
          )}
        </Link>

        <div className="pointer-events-none absolute left-0 top-0 flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-[3px] text-[10px] font-bold tracking-wide ${
              soldOut
                ? "border-red-400/40 bg-red-500/15 text-red-200"
                : "border-indigo-400/40 bg-indigo-500/15 text-indigo-200"
            }`}
          >
            <span className={`size-1 rounded-full ${soldOut ? "bg-red-300" : "bg-indigo-300"}`} />
            {soldOut ? "품절" : "판매중"}
          </span>
          {rating !== null ? (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-amber-300">
              <Star className="size-3 fill-amber-300 text-amber-300" />
              {rating.toFixed(1)}
            </span>
          ) : null}
        </div>

        <div className="absolute right-0 top-0 flex gap-1.5">
          <Link
            href={href}
            aria-label="상세 정보"
            className="flex size-[30px] items-center justify-center rounded-lg border border-white/10 bg-black/50 backdrop-blur"
          >
            <BarChart3 className="size-3.5 text-cyan-400" />
          </Link>
          <button
            type="button"
            aria-label="찜하기"
            aria-pressed={wishlisted}
            onClick={onToggleWishlist}
            className="flex size-[30px] items-center justify-center rounded-lg border border-white/10 bg-black/50 backdrop-blur"
          >
            <Heart className={`size-3.5 ${wishlisted ? "fill-rose-500 text-rose-500" : "text-white"}`} />
          </button>
        </div>

        {tag ? (
          <span className="pointer-events-none absolute bottom-1 left-0 text-[11px] font-extrabold uppercase text-neutral-400">
            {tag}
          </span>
        ) : null}

        <span className="pointer-events-none absolute bottom-0 right-0 inline-flex items-baseline gap-0.5 rounded-lg bg-white px-2 py-1 shadow-lg">
          {originalPriceText ? (
            <span className="mr-1 text-[10px] font-semibold text-neutral-400 line-through">{originalPriceText}</span>
          ) : null}
          <span className="text-[11px] font-bold text-neutral-400">₩</span>
          <span className="text-[15px] font-extrabold leading-none text-black">{priceText}</span>
        </span>
      </div>

      {/* 정보 */}
      <div className="mt-4 flex items-baseline justify-between gap-2">
        <Link href={href} className="min-w-0 truncate text-[15px] font-extrabold tracking-wide text-white">
          {title}
        </Link>
        <span className="shrink-0 text-[11px] text-neutral-500">{timeAgo(product.createdAt)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
        <span className="min-w-0 truncate font-semibold text-neutral-400">판매자 {shopName}</span>
        <span className="shrink-0 text-neutral-500">{sold.toLocaleString("ko-KR")}개 판매</span>
      </div>

      {/* 망토 (왼쪽 하단) */}
      <div className="mt-2.5 flex min-h-[26px] flex-wrap items-center gap-1">
        {shownCapes.map((c, i) => (
          <CapeIcon
            key={`${c.source}-${i}`}
            cape={c}
            src={`/api/mc-account/${encodeURIComponent(product.id)}?asset=cape&i=${i}`}
          />
        ))}
        {moreCapes > 0 ? (
          <span className="flex h-[26px] min-w-[22px] items-center justify-center rounded-[4px] bg-indigo-500/25 px-1 text-[10px] font-bold text-indigo-200">
            +{moreCapes}
          </span>
        ) : null}
      </div>

      {/* 버튼 */}
      <div className="mt-3 flex gap-2">
        <Link
          href={href}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[10px] border border-[#243052] bg-[#121a30] text-[13px] font-bold text-indigo-100 transition hover:bg-[#18223d]"
        >
          <ExternalLink className="size-3.5" />
          상세보기
        </Link>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="새 탭에서 열기"
          className="flex size-10 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.03] text-neutral-300 transition hover:bg-white/[0.07]"
        >
          <ExternalLink className="size-3.5" />
        </a>
        <button
          type="button"
          disabled={soldOut}
          aria-label="장바구니 담기"
          onClick={onAddToCart}
          className="flex size-10 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.03] text-neutral-300 transition hover:bg-white/[0.07] disabled:opacity-35"
        >
          <ShoppingCart className="size-3.5" />
        </button>
      </div>
    </motion.li>
  );
}
