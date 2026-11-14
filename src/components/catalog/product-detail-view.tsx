"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Minus,
  Plus,
  Share2,
  ShoppingBag,
  ShoppingCart,
} from "lucide-react";
import type { ProductWithStock } from "@/lib/types";
import { formatKRW } from "@/lib/utils";
import { productDiscountPercent } from "@/lib/pricing";
import { McCapeChips, McHypixelPanel, McSkinHero, useMcAccountInfo } from "@/components/catalog/mc-account-extras";
import { StockBadge } from "@/components/ui/stock-badge";
import { WishHeartButton } from "@/components/ui/wish-heart-button";
import { shopHeaders } from "@/lib/shop-client";
import { shopPath, useShopBase } from "@/lib/shop-nav";
import { fadeUp, vxTransition } from "@/lib/motion";
import { addToCart, CART_ADD_EVENT, loadCart } from "@/components/shop/shop-cart";
import { useShopUser } from "@/components/shop/user-context";

export function ProductDetailView({
  product,
  shopSlug,
  backHref,
  eventDiscountPercent = 0,
}: {
  product: ProductWithStock;
  shopSlug: string;
  backHref: string;
  eventDiscountPercent?: number;
}) {
  const router = useRouter();
  const base = useShopBase();
  const { user } = useShopUser();
  const [quantity, setQuantity] = useState(1);
  const [descOpen, setDescOpen] = useState(true);
  const [wishlisted, setWishlisted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [cartBump, setCartBump] = useState(0);

  useEffect(() => {
    const sync = () => {
      const n = loadCart(shopSlug).reduce((s, i) => s + i.quantity, 0);
      setCartCount(n);
    };
    sync();
    const onAdd = () => {
      sync();
      setCartBump((k) => k + 1);
    };
    window.addEventListener(CART_ADD_EVENT, onAdd);
    return () => window.removeEventListener(CART_ADD_EVENT, onAdd);
  }, [shopSlug]);

  const soldOut = product.stockStatus === "sold_out";
  const isMc = product.productKind === "mc_account";
  const title = isMc && product.mcMaskedName ? product.mcMaskedName : product.name;
  const mcInfo = useMcAccountInfo(product.id, product.mcVersion, isMc);
  const maxQty = Math.min(Math.max(product.availableCount, 1), 99);
  const discount = Math.max(0, Math.min(90, eventDiscountPercent + productDiscountPercent(product)));
  const finalPrice = discount > 0 ? Math.round(product.price * (1 - discount / 100)) : product.price;
  const total = finalPrice * quantity;

  const imageUrl = useMemo(() => {
    if (product.thumbnail?.trim()) return product.thumbnail.trim();
    return null;
  }, [product.thumbnail]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  function changeQty(delta: number) {
    setQuantity((q) => Math.min(Math.max(q + delta, 1), maxQty));
  }

  async function toggleWish() {
    if (!user) {
      flash("로그인 후 찜할 수 있어요");
      return;
    }
    try {
      const res = await fetch("/api/wishlist", {
        method: "POST",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });
      const data = (await res.json()) as { wishlisted?: boolean };
      if (res.ok) {
        setWishlisted(Boolean(data.wishlisted));
        flash(data.wishlisted ? "찜 목록에 추가했어요" : "찜을 해제했어요");
      }
    } catch {
      flash("찜 처리에 실패했어요");
    }
  }

  function handleAddCart() {
    if (soldOut) return;
    addToCart(shopSlug, product.id, quantity);
    flash(`장바구니에 ${quantity}개 담았어요`);
  }

  function handleBuyNow() {
    if (soldOut) return;
    router.push(
      shopPath(base, `/checkout?product=${encodeURIComponent(product.slug)}&qty=${quantity}`),
    );
  }

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: product.name, url });
      } else {
        await navigator.clipboard.writeText(url);
        flash("링크를 복사했어요");
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="product-detail-screen">
      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-full border border-white/15 bg-black/85 px-4 py-2 text-xs text-white shadow-xl backdrop-blur"
          >
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {cartCount > 0 ? (
        <motion.button
          type="button"
          key={cartBump}
          initial={false}
          animate={{ scale: cartBump ? [1, 1.16, 0.95, 1.05, 1] : 1 }}
          transition={{ duration: 0.45 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => router.push(shopPath(base, "/dashboard?tab=products"))}
          className="fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-100 shadow-lg backdrop-blur-md"
        >
          <ShoppingCart className="size-3.5" />
          장바구니 {cartCount}
        </motion.button>
      ) : null}

      <header className="product-detail-topbar">
        <Link href={shopPath(base, backHref)} className="product-detail-back" aria-label="뒤로">
          <ArrowLeft className="size-5" />
        </Link>
        <span className="truncate text-sm font-medium text-neutral-300">{product.name}</span>
        <button type="button" onClick={() => void share()} className="product-detail-back" aria-label="공유">
          <Share2 className="size-4" />
        </button>
      </header>

      <motion.div
        className="product-detail-hero"
        initial={fadeUp.initial}
        animate={fadeUp.animate}
        transition={vxTransition}
      >
        {isMc && !imageUrl ? (
          <McSkinHero productId={product.id} version={product.mcVersion} alt={title} />
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={product.name} referrerPolicy="no-referrer" className="product-detail-image" />
        ) : (
          <div className="product-detail-image-placeholder">
            <ShoppingBag className="size-14 text-neutral-600" />
          </div>
        )}
        {discount > 0 ? (
          <span className="absolute left-4 top-4 rounded-full bg-red-500 px-2.5 py-1 text-[11px] font-bold text-white">
            {discount}% OFF
          </span>
        ) : null}
      </motion.div>

      <div className="product-detail-body">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="product-detail-category">
              {product.category || "상품"}
              {product.fulfillment === "manual" ? " · 수동지급" : ""}
            </p>
            <h1 className="product-detail-title">{title}</h1>
          </div>
          <WishHeartButton active={wishlisted} onToggle={() => void toggleWish()} />
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {discount > 0 ? (
            <>
              <span className="text-sm text-neutral-500 line-through">{formatKRW(product.price)}</span>
              <span className="text-lg font-bold text-red-400">{discount}%</span>
            </>
          ) : null}
          <p className="product-detail-price">{formatKRW(finalPrice)}</p>
        </div>
        {isMc ? <McCapeChips productId={product.id} version={product.mcVersion} info={mcInfo} /> : null}
        {isMc ? <McHypixelPanel info={mcInfo} /> : null}

        <div className="flex flex-wrap items-center gap-2">
          <StockBadge status={product.stockStatus} />
          {product.fulfillment === "manual" ? (
            <span className="text-xs text-amber-300">구매 후 관리자가 직접 지급합니다</span>
          ) : !soldOut && product.availableCount > 0 ? (
            <span className="text-xs text-neutral-500">재고 {product.availableCount}개</span>
          ) : null}
          {user ? (
            <span className="text-xs text-neutral-500">보유 {formatKRW(user.points)}</span>
          ) : null}
        </div>

        <div className="product-detail-qty">
          <span className="text-sm text-neutral-400">구매 수량</span>
          <div className="product-detail-qty-controls">
            <motion.button type="button" whileTap={{ scale: 0.88 }} onClick={() => changeQty(-1)} disabled={quantity <= 1 || soldOut}>
              <Minus className="size-4" />
            </motion.button>
            <motion.span key={quantity} initial={{ scale: 0.85, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }}>
              {quantity}
            </motion.span>
            <motion.button type="button" whileTap={{ scale: 0.88 }} onClick={() => changeQty(1)} disabled={quantity >= maxQty || soldOut}>
              <Plus className="size-4" />
            </motion.button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-400">총 상품금액</span>
            <span className="text-lg font-bold text-white">{formatKRW(total)}</span>
          </div>
        </div>

        <button
          type="button"
          className="product-detail-desc-toggle"
          onClick={() => setDescOpen((v) => !v)}
        >
          <span>상품 정보</span>
          {descOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        {descOpen ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="product-detail-desc"
          >
            {product.description || "상세 설명이 없습니다."}
          </motion.div>
        ) : null}
      </div>

      <div className="product-detail-checkout !space-y-0">
        <div className="grid grid-cols-[1fr_1.35fr] gap-2">
          <motion.button
            type="button"
            disabled={soldOut}
            onClick={handleAddCart}
            whileTap={{ scale: 0.96 }}
            className="flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-transparent py-3.5 text-sm font-semibold text-white disabled:opacity-35"
          >
            <motion.span
              key={toast?.includes("장바구니") ? toast : "cart"}
              animate={toast?.includes("장바구니") ? { scale: [1, 1.25, 1], rotate: [0, -10, 0] } : {}}
              transition={{ duration: 0.35 }}
            >
              <ShoppingCart className="size-4" />
            </motion.span>
            장바구니
          </motion.button>
          <motion.button
            type="button"
            disabled={soldOut}
            onClick={handleBuyNow}
            whileTap={{ scale: 0.97 }}
            className="product-detail-buy !w-full"
          >
            {soldOut ? "품절" : "바로구매"}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
