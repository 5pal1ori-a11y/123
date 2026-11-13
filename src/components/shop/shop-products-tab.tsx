"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Copy, ShoppingBag } from "lucide-react";
import type { ProductWithStock, ShopEvent, ShopTier, StockStatus } from "@/lib/types";
import { calcProductPrice } from "@/lib/pricing";
import { formatKRW } from "@/lib/utils";
import { shopPath, useShopBase } from "@/lib/shop-nav";
import { StockBadge } from "@/components/ui/stock-badge";
import { WishHeartButton } from "@/components/ui/wish-heart-button";
import { PanelPrimaryBtn, PanelStats } from "@/components/admin/admin-panel-ui";
import { McAccountCard } from "./mc-account-card";

export type ProductSort = "default" | "price_asc" | "price_desc" | "popular";
export type ProductSection = "general" | "mc_account";
export type ShopListingSummary = { rating: number | null; reviewCount: number; sold: number };

const SECTIONS: { id: ProductSection; label: string }[] = [
  { id: "general", label: "기타상품" },
  { id: "mc_account", label: "마인크래프트 계정" },
];

export function ShopProductsTab({
  products,
  eventByProduct,
  filteredProducts,
  productQuery,
  productCategory,
  productSort,
  productCategories,
  productSection,
  sectionCounts,
  onSectionChange,
  shopName,
  salesCounts,
  shopSummary,
  liveStock,
  wishlistIds,
  tier,
  onQueryChange,
  onCategoryChange,
  onSortChange,
  onToggleWishlist,
  userPoints,
  buyBusyId,
  purchaseCode,
  purchasePending,
  purchaseError,
  copiedPurchase,
  onBuy,
  onCopyCode,
  onAddToCart,
}: {
  products: ProductWithStock[];
  eventByProduct: Map<string, ShopEvent>;
  filteredProducts: ProductWithStock[];
  productQuery: string;
  productCategory: string;
  productSort: ProductSort;
  productCategories: string[];
  productSection: ProductSection;
  sectionCounts: Record<ProductSection, number>;
  onSectionChange: (v: ProductSection) => void;
  shopName: string;
  salesCounts: Record<string, number>;
  shopSummary: ShopListingSummary | null;
  liveStock: Record<string, { count: number; status: StockStatus }>;
  wishlistIds: Set<string>;
  tier: ShopTier | null;
  onQueryChange: (v: string) => void;
  onCategoryChange: (v: string) => void;
  onSortChange: (v: ProductSort) => void;
  onToggleWishlist: (productId: string) => void;
  userPoints: number;
  buyBusyId: string | null;
  purchaseCode: string | null;
  purchasePending?: boolean;
  purchaseError: string | null;
  copiedPurchase: boolean;
  onBuy: (productId: string, name: string) => void;
  onCopyCode: () => void;
  onAddToCart?: (productId: string) => void;
}) {
  const base = useShopBase();

  return (
    <div className="space-y-5">
      <PanelStats
        items={[
          { label: "보유 포인트", value: formatKRW(userPoints) },
          { label: "찜한 상품", value: wishlistIds.size },
          { label: "전체 상품", value: products.length },
        ]}
      />

      {purchasePending ? (
        <div className="admin-bento p-5 text-center">
          <p className="text-sm font-semibold text-amber-200">지급대기</p>
          <p className="mt-2 text-sm text-neutral-300">
            {purchaseCode || "관리자가 확인 후 수동으로 지급합니다."}
          </p>
        </div>
      ) : purchaseCode ? (
        <div className="admin-bento p-5 text-center">
          <p className="text-sm font-semibold text-white">상품 발급 완료</p>
          <code className="mt-3 block break-all rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs">
            {purchaseCode}
          </code>
          <PanelPrimaryBtn className="mt-4 px-5 py-2 text-sm" onClick={onCopyCode}>
            {copiedPurchase ? (
              <>
                <Check className="size-4" /> 복사됨
              </>
            ) : (
              <>
                <Copy className="size-4" /> 복사하기
              </>
            )}
          </PanelPrimaryBtn>
        </div>
      ) : null}

      {purchaseError ? <p className="text-sm text-red-400">{purchaseError}</p> : null}

      <div className="admin-bento p-4 sm:p-5">
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {SECTIONS.map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => onSectionChange(sec.id)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                productSection === sec.id ? "bg-white text-black" : "text-neutral-300 hover:bg-white/[0.06]"
              }`}
            >
              {sec.label}
              <span className="ml-1.5 text-xs text-neutral-500">
                {sectionCounts[sec.id]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <input
            value={productQuery}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="제품 검색"
            className="toss-admin-field min-w-0 flex-1"
          />
          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            {productCategories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onCategoryChange(c)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  productCategory === c
                    ? "border-white/25 bg-white text-black"
                    : "border-white/10 bg-white/[0.04] text-neutral-300 hover:bg-white/[0.08]"
                }`}
              >
                {c === "all" ? "전체" : c}
              </button>
            ))}
          </div>
          <select
            value={productSort}
            onChange={(e) => onSortChange(e.target.value as ProductSort)}
            className="toss-admin-field sm:w-36"
          >
            <option value="default">기본순</option>
            <option value="price_asc">가격 낮은순</option>
            <option value="price_desc">가격 높은순</option>
            <option value="popular">인기순</option>
          </select>
        </div>

        {filteredProducts.length === 0 ? (
          <p className="py-12 text-center text-sm text-neutral-500">검색 결과가 없어요</p>
        ) : productSection === "mc_account" ? (
          <ul className="mt-4 grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((p, idx) => {
              const ev = eventByProduct.get(p.id);
              const live = liveStock[p.id];
              const stockStatus = live?.status ?? p.stockStatus;
              const { finalPrice, totalDiscountPercent } = calcProductPrice(p, tier, ev ?? null);
              return (
                <McAccountCard
                  key={p.id}
                  product={p}
                  index={idx}
                  shopName={shopName}
                  priceText={finalPrice.toLocaleString("ko-KR")}
                  originalPriceText={totalDiscountPercent > 0 ? p.price.toLocaleString("ko-KR") : null}
                  discountPercent={totalDiscountPercent}
                  stockStatus={stockStatus}
                  sold={shopSummary?.sold ?? salesCounts[p.id] ?? 0}
                  rating={shopSummary?.rating ?? null}
                  wishlisted={wishlistIds.has(p.id)}
                  onToggleWishlist={() => onToggleWishlist(p.id)}
                  onAddToCart={() => onAddToCart?.(p.id)}
                />
              );
            })}
          </ul>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredProducts.map((p, idx) => {
              const ev = eventByProduct.get(p.id);
              const live = liveStock[p.id];
              const stockStatus = live?.status ?? p.stockStatus;
              const stockCount = live?.count ?? p.availableCount;
              const soldOut = stockStatus === "sold_out";
              const { finalPrice, totalDiscountPercent } = calcProductPrice(p, tier, ev ?? null);
              const wishlisted = wishlistIds.has(p.id);
              return (
                <motion.li
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx * 0.03, 0.24), duration: 0.32 }}
                  whileHover={{ y: -2 }}
                  className="flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-4"
                >
                  <Link
                    href={shopPath(base, `/product/${p.slug}`)}
                    className={`min-w-0 flex-1 ${soldOut ? "opacity-55" : ""}`}
                  >
                    {p.thumbnail?.trim() ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.thumbnail.trim()}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="mb-3 aspect-[16/9] w-full rounded-xl border border-white/10 bg-white/[0.03] object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : null}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="font-semibold text-white hover:text-accent">{p.name}</span>
                        <StockBadge status={stockStatus} />
                      </div>
                    </div>
                    <p className="mt-1 text-[11px] text-neutral-500">
                      {p.category ? `${p.category} · ` : ""}
                      {p.fulfillment === "manual" ? "수동지급 · " : ""}
                      재고 {p.fulfillment === "manual" ? "판매중" : `${stockCount}개`}
                    </p>
                    {ev || (tier && tier.discountPercent > 0) ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {ev ? (
                          <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold text-orange-400">
                            이벤트 {ev.discountPercent}%
                          </span>
                        ) : null}
                        {tier && tier.discountPercent > 0 ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ backgroundColor: `${tier.color}22`, color: tier.color }}
                          >
                            {tier.name} {tier.discountPercent}%
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {p.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{p.description}</p>
                    ) : null}
                    <div className="mt-2 flex items-baseline gap-2">
                      {totalDiscountPercent > 0 ? (
                        <span className="text-xs text-neutral-500 line-through">{formatKRW(p.price)}</span>
                      ) : null}
                      <p className="text-sm font-bold text-white">{formatKRW(finalPrice)}</p>
                    </div>
                  </Link>
                  <div className="mt-3 flex items-center gap-2">
                    <WishHeartButton
                      active={wishlisted}
                      onToggle={() => onToggleWishlist(p.id)}
                      size="sm"
                      className="!rounded-xl"
                    />
                    <motion.button
                      type="button"
                      disabled={soldOut}
                      whileTap={{ scale: 0.92 }}
                      onClick={() => onAddToCart?.(p.id)}
                      className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5 text-xs font-semibold text-neutral-200 disabled:opacity-35"
                    >
                      <span className="inline-flex items-center gap-1">
                        <ShoppingBag className="size-3.5" />
                        담기
                      </span>
                    </motion.button>
                    <Link
                      href={shopPath(base, `/product/${p.slug}`)}
                      className="flex flex-1 items-center justify-center rounded-xl bg-white px-3 py-2.5 text-xs font-semibold text-black transition active:scale-[0.98]"
                    >
                      {soldOut ? "상세 보기" : "구매하기"}
                    </Link>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
