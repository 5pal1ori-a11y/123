"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, ExternalLink, Heart, Package, ShoppingCart, User } from "lucide-react";
import type { ProductWithStock, StockStatus } from "@/lib/types";
import type { McAccountInfo, McCapeInfo } from "@/lib/mc-account";
import { useCapeFace } from "@/components/capes/cape-face";
import { CAPE_BY_TYPE } from "@/lib/capes-data";

/** 카드를 누르면 그 카드에만 윤곽선 (한 번에 하나) */
const SELECT_EVENT = "does-card-select";
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
export function CapeIcon({ src, cape }: { src: string; cape: McCapeInfo }) {
  const faceSrc = useCapeFace(cape.hash);
  if (cape.hash && faceSrc) {
    return (
      <span
        title={cape.title}
        className="flex h-[26px] w-[20px] items-center justify-center rounded-[4px] bg-[rgba(255,255,255,0.06)] ring-1 ring-[rgba(255,255,255,0.1)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={faceSrc} alt={cape.title ?? ""} className="h-[22.4px] w-[14px]" style={{ imageRendering: "pixelated" }} />
      </span>
    );
  }
  return <CapeIconLegacy src={src} cape={cape} />;
}

function CapeIconLegacy({ src, cape }: { src: string; cape: McCapeInfo }) {
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

  const label = cape.title || (cape.source === "optifine" ? "OptiFine" : "Minecraft Cape");

  // capes.me 이미지는 이미 앞면만 그려져 있어 그대로 줄여서 보여준다
  if (cape.front) {
    return (
      <span
        title={label}
        className="flex h-[26px] w-[20px] items-center justify-center rounded-[4px] bg-[rgba(255,255,255,0.06)] ring-1 ring-[rgba(255,255,255,0.1)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={label} className="h-[22.4px] w-[14px]" style={{ imageRendering: "pixelated" }} />
      </span>
    );
  }

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
      title={label}
      className="flex h-[26px] w-[20px] items-center justify-center rounded-[4px] bg-[rgba(255,255,255,0.06)] ring-1 ring-[rgba(255,255,255,0.1)]"
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
  discountPercent = 0,
  stockStatus,
  sold,
  rating,
  wishlisted,
  onToggleWishlist,
  onAddToCart,
  onView,
}: {
  product: ProductWithStock;
  index: number;
  shopName: string;
  priceText: string;
  originalPriceText?: string | null;
  discountPercent?: number;
  stockStatus: StockStatus;
  sold: number;
  rating: number | null;
  wishlisted: boolean;
  onToggleWishlist: () => void;
  onAddToCart?: () => void;
  /** 있으면 이미지 · 상세보기 를 눌렀을 때 이동 대신 이 동작 (망토 3D 보기) */
  onView?: () => void;
}) {
  const base = useShopBase();
  const isMc = product.productKind === "mc_account";
  const isCape = product.productKind === "mc_cape";
  const capeHash = isCape && product.capeType ? CAPE_BY_TYPE[product.capeType]?.hash ?? null : null;
  const capeSrc = useCapeFace(capeHash);
  const [selected, setSelected] = useState(false);
  useEffect(() => {
    // 상세 페이지에서 돌아와도 마지막으로 누른 계정에 윤곽선을 남긴다
    try {
      if (sessionStorage.getItem("mc-card-selected") === product.id) setSelected(true);
    } catch {
      /* storage blocked */
    }
    const on = (e: Event) => setSelected((e as CustomEvent<string>).detail === product.id);
    window.addEventListener(SELECT_EVENT, on);
    return () => window.removeEventListener(SELECT_EVENT, on);
  }, [product.id]);
  const select = () => {
    try {
      sessionStorage.setItem("mc-card-selected", product.id);
    } catch {
      /* storage blocked */
    }
    window.dispatchEvent(new CustomEvent(SELECT_EVENT, { detail: product.id }));
  };
  const href = shopPath(base, `/product/${product.slug}`);
  const soldOut = stockStatus === "sold_out";
  const [info, setInfo] = useState<McAccountInfo | null>(null);
  const [skinFailed, setSkinFailed] = useState(false);
  const ver = encodeURIComponent(product.mcVersion ?? "0");

  useEffect(() => {
    if (!isMc) return;
    let alive = true;
    fetch(`/api/mc-account/${encodeURIComponent(product.id)}?v=${ver}`)
      .then((r) => (r.ok ? (r.json() as Promise<McAccountInfo>) : null))
      .then((d) => alive && setInfo(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [product.id, ver, isMc]);

  const skinSrc = product.thumbnail?.trim() || `/api/mc-account/${encodeURIComponent(product.id)}?asset=skin&v=${ver}`;
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
      onClickCapture={select}
      className={`mc-card mf-dark flex flex-col rounded-[14px] border bg-[#0b1020] p-3 transition-[border-color,box-shadow,transform] duration-200 [&_a]:outline-none [&_button]:outline-none ${selected ? "" : "hover:!border-white/70 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.7)]"}`}
      style={
        selected
          ? { borderColor: "#ffffff", boxShadow: "0 0 0 2px #ffffff, 0 0 26px rgba(255,255,255,0.45)" }
          : { borderColor: "#2a3450", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04), 0 1px 0 rgba(255,255,255,0.03)" }
      }
    >
      {/* 스킨 영역 */}
      <div className="relative h-[180px] rounded-[10px] sm:h-[210px]">
        <ViewWrap href={href} onView={onView} className="absolute inset-0 flex items-end justify-center overflow-hidden rounded-[10px]">
          {isMc ? (
            <>
          {!skinFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={skinSrc}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full object-contain object-bottom"
              style={{
                imageRendering: "pixelated",
                ...(soldOut ? { filter: "grayscale(1) brightness(0.55)" } : null),
              }}
              onError={() => setSkinFailed(true)}
            />
          ) : (
            <User className="mb-16 size-16 text-[rgba(255,255,255,0.1)]" />
          )}
            </>
          ) : isCape ? (
            capeSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={capeSrc}
                alt={product.name}
                className="mb-6 h-[170px] w-auto self-center"
                style={{ imageRendering: "pixelated", ...(soldOut ? { filter: "grayscale(1) brightness(0.55)" } : null) }}
              />
            ) : null
          ) : product.thumbnail?.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.thumbnail.trim()}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full rounded-[10px] object-cover"
              style={soldOut ? { filter: "grayscale(1) brightness(0.55)" } : undefined}
            />
          ) : (
            <Package className="mb-16 size-16 self-center text-[rgba(255,255,255,0.15)]" />
          )}
        </ViewWrap>

        <div className="pointer-events-none absolute left-0 top-0 z-10 flex max-w-[calc(100%-72px)] items-center gap-1.5">
          <span
            className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-[11px] font-bold leading-none ${
              soldOut
                ? "border-[rgba(248,113,113,0.45)] bg-[rgba(60,12,16,0.88)] text-[#fecaca] backdrop-blur"
                : "border-[rgba(129,140,248,0.45)] bg-[rgba(20,22,58,0.88)] text-[#c7d2fe] backdrop-blur"
            }`}
          >
            <span className={`size-1 rounded-full ${soldOut ? "bg-[#fca5a5]" : "bg-[#a5b4fc]"}`} />
            {soldOut ? "SOLD" : "AVAILABLE"}
          </span>
        </div>

        <div className="absolute right-0 top-0 z-10 flex gap-1.5">
          <Link
            href={href}
            aria-label="상세 정보"
            className="flex size-[30px] items-center justify-center rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.5)] backdrop-blur"
          >
            <BarChart3 className="size-3.5 text-[#22d3ee]" />
          </Link>
          <button
            type="button"
            aria-label="찜하기"
            aria-pressed={wishlisted}
            onClick={onToggleWishlist}
            className="flex size-[30px] items-center justify-center rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.5)] backdrop-blur"
          >
            <Heart className={`size-3.5 ${wishlisted ? "fill-[#f43f5e] text-[#f43f5e]" : "text-[#ffffff]"}`} />
          </button>
        </div>

        {tag || info?.hypixel?.rank ? (
          <span className="pointer-events-none absolute bottom-1 left-0 flex flex-col items-start gap-1">
            {info?.hypixel?.rank ? (
              <span
                className="rounded-[4px] bg-[rgba(0,0,0,0.55)] px-1.5 py-0.5 text-[11px] font-extrabold leading-none"
                style={{ color: info.hypixel.rankColor }}
                title="Hypixel 랭크"
              >
                [{info.hypixel.rank}]
              </span>
            ) : null}
            {tag ? <span className="text-[11px] font-extrabold uppercase text-[#a3a3a3]">{tag}</span> : null}
            {isMc && Date.now() - new Date(product.createdAt).getTime() < 60 * 60_000 ? (
              <span className="rounded-full bg-[#f5c542] px-1.5 py-0.5 text-[10px] font-extrabold text-black">PASS+ 선공개</span>
            ) : null}
          </span>
        ) : null}

        {discountPercent > 0 ? (
          <span className="pointer-events-none absolute bottom-[42px] right-0 rounded-md bg-[#ef4444] px-1.5 py-1 text-[11px] font-extrabold leading-none text-[#ffffff] shadow">
            -{discountPercent}%
          </span>
        ) : null}
        <span className="pointer-events-none absolute bottom-0 right-0 inline-flex items-baseline gap-0.5 rounded-lg bg-[#ffffff] px-2 py-1 shadow-lg">
          {originalPriceText ? (
            <span className="mr-1 text-[10px] font-semibold text-[#a3a3a3] line-through">{originalPriceText}</span>
          ) : null}
          <span className="text-[11px] font-bold text-[#a3a3a3]">₩</span>
          <span
            className={`text-[15px] font-extrabold leading-none text-[#000000] ${soldOut ? "line-through opacity-60" : ""}`}
          >
            {priceText}
          </span>
        </span>
      </div>

      {/* 정보 */}
      <div className="mt-4 flex items-baseline justify-between gap-2">
        <Link href={href} className="min-w-0 truncate text-[15px] font-extrabold tracking-wide text-[#ffffff]">
          {title}
        </Link>
        <span className="shrink-0 text-[11px] text-[#737373]">{timeAgo(product.createdAt)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
        <span className="min-w-0 truncate font-semibold text-[#a3a3a3]">판매자 {shopName}</span>
        <span className="shrink-0 text-[#737373]">{sold.toLocaleString("ko-KR")}개 판매</span>
      </div>

      {/* 망토 (왼쪽 하단) */}
      <div className="mt-2.5 flex min-h-[26px] flex-wrap items-center gap-1">
        {!isMc ? (
          <span className="text-[11px] font-semibold text-[#737373]">{isCape ? "망토 리딤 코드" : product.category || "기타상품"}</span>
        ) : null}
        {shownCapes.map((c, i) => (
          <CapeIcon
            key={`${c.source}-${i}`}
            cape={c}
            src={`/api/mc-account/${encodeURIComponent(product.id)}?asset=cape&i=${i}&v=${ver}`}
          />
        ))}
        {soldOut ? <span className="ml-auto text-[11px] font-extrabold tracking-wide text-[#737373]">SOLD</span> : null}
        {moreCapes > 0 ? (
          <span className="flex h-[26px] min-w-[22px] items-center justify-center rounded-[4px] bg-[rgba(99,102,241,0.25)] px-1 text-[10px] font-bold text-[#c7d2fe]">
            +{moreCapes}
          </span>
        ) : null}
      </div>

      {/* 버튼 */}
      <div className="mt-3 flex gap-2">
        <ViewWrap
          href={href}
          onView={onView}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[10px] border border-[#243052] bg-[#121a30] text-[13px] font-bold text-[#e0e7ff] transition hover:bg-[#18223d]"
        >
          <ExternalLink className="size-3.5" />
          상세보기
        </ViewWrap>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="새 탭에서 열기"
          className="flex size-10 items-center justify-center rounded-[10px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-[#d4d4d4] transition hover:bg-[rgba(255,255,255,0.07)]"
        >
          <ExternalLink className="size-3.5" />
        </a>
        <button
          type="button"
          disabled={soldOut}
          aria-label="장바구니 담기"
          onClick={onAddToCart}
          className="flex size-10 items-center justify-center rounded-[10px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-[#d4d4d4] transition hover:bg-[rgba(255,255,255,0.07)] disabled:opacity-35"
        >
          <ShoppingCart className="size-3.5" />
        </button>
      </div>
    </motion.li>
  );
}

function ViewWrap({
  href,
  onView,
  className,
  children,
}: {
  href: string;
  onView?: () => void;
  className: string;
  children: React.ReactNode;
}) {
  if (onView) {
    return (
      <button type="button" onClick={onView} className={className}>
        {children}
      </button>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
