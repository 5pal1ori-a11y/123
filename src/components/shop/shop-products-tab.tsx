"use client";

import { Check, Copy } from "lucide-react";
import type { ProductWithStock, ShopEvent, ShopTier, StockStatus } from "@/lib/types";
import { calcProductPrice } from "@/lib/pricing";
import { formatKRW } from "@/lib/utils";
import { shopPath, useShopBase } from "@/lib/shop-nav";
import { PanelPrimaryBtn, PanelStats } from "@/components/admin/admin-panel-ui";
import { McAccountCard } from "./mc-account-card";
import { CapeGallery, type CapeStock } from "@/components/capes/cape-gallery";

export type ProductSort = "default" | "price_asc" | "price_desc" | "popular";
export type ProductSection = "general" | "mc_account" | "mc_cape";
export type ShopListingSummary = { rating: number | null; reviewCount: number; sold: number };

const SECTIONS: { id: ProductSection; label: string; short: string }[] = [
  { id: "mc_account", label: "마인크래프트 계정", short: "마크 계정" },
  { id: "mc_cape", label: "마인크래프트 망토", short: "마크 망토" },
  { id: "general", label: "기타상품", short: "기타상품" },
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
  const isSoldOut = (p: ProductWithStock) => (liveStock[p.id]?.status ?? p.stockStatus) === "sold_out";
  const onSaleMc = filteredProducts.filter((p) => !isSoldOut(p));
  const soldMc = filteredProducts.filter(isSoldOut);
  const capeStock: CapeStock = {};
  for (const p of products) {
    if (p.productKind !== "mc_cape" || !p.capeType) continue;
    const live = liveStock[p.id];
    const count = live?.count ?? p.availableCount;
    capeStock[p.capeType] = { count, price: calcProductPrice(p, tier, eventByProduct.get(p.id) ?? null).finalPrice, href: shopPath(base, `/product/${p.slug}`) };
  }

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
        <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {SECTIONS.map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => onSectionChange(sec.id)}
              className={`whitespace-nowrap rounded-lg px-1.5 py-2 text-[13px] font-semibold transition sm:px-3 sm:text-sm ${
                productSection === sec.id ? "bg-white text-black" : "text-neutral-300 hover:bg-white/[0.06]"
              }`}
            >
              <span className="sm:hidden">{sec.short}</span>
              <span className="hidden sm:inline">{sec.label}</span>
              <span className="ml-1.5 text-xs text-neutral-500">
                {sectionCounts[sec.id]}
              </span>
            </button>
          ))}
        </div>
        {productSection === "mc_cape" ? (
          <CapeGallery
            stock={capeStock}
            renderCard={(cape, open, idx) => {
              const p = products.find((x) => x.productKind === "mc_cape" && x.capeType === cape.type);
              const stub = {
                id: `cape-${cape.type}`,
                slug: "",
                name: `${cape.title} 망토`,
                price: 0,
                productKind: "mc_cape",
                capeType: cape.type,
                availableCount: 0,
                stockStatus: "sold_out",
                createdAt: new Date().toISOString(),
                tags: [],
              } as unknown as ProductWithStock;
              const prod = p ?? stub;
              const live = p ? liveStock[p.id] : undefined;
              const stockStatus = p ? (live?.status ?? p.stockStatus) : "sold_out";
              const { finalPrice, totalDiscountPercent } = p
                ? calcProductPrice(p, tier, eventByProduct.get(p.id) ?? null)
                : { finalPrice: 0, totalDiscountPercent: 0 };
              return (
                <McAccountCard
                  key={cape.type}
                  product={{ ...prod, name: `${cape.title} 망토` }}
                  index={idx}
                  shopName={shopName}
                  priceText={p ? finalPrice.toLocaleString("ko-KR") : "-"}
                  originalPriceText={p && totalDiscountPercent > 0 ? p.price.toLocaleString("ko-KR") : null}
                  discountPercent={totalDiscountPercent}
                  stockStatus={stockStatus}
                  sold={p ? (shopSummary?.sold ?? salesCounts[p.id] ?? 0) : 0}
                  rating={shopSummary?.rating ?? null}
                  wishlisted={p ? wishlistIds.has(p.id) : false}
                  onToggleWishlist={() => p && onToggleWishlist(p.id)}
                  onAddToCart={() => p && onAddToCart?.(p.id)}
                  onView={open}
                />
              );
            }}
          />
        ) : (
        <>
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
        ) : (
          <>
            {[
              { key: "on", title: null as string | null, list: onSaleMc },
              { key: "sold", title: "Sold", list: soldMc },
            ].map((grp) =>
              grp.list.length === 0 ? null : (
                <div key={grp.key} className={grp.title ? "mt-10" : ""}>
                  {grp.title ? (
                    <div className="mf-dark mb-4 flex items-baseline gap-3 border-b border-white/10 pb-2">
                      <h3 className="text-2xl font-extrabold text-[#737373]">{grp.title}</h3>
                      <span className="text-sm font-semibold text-[#525252]">{grp.list.length}개 계정</span>
                    </div>
                  ) : null}
                  <ul
                    className={`grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${
                      grp.title ? "" : "mt-4"
                    }`}
                  >
                    {grp.list.map((p, idx) => {
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
                </div>
              ),
            )}
          </>
        )}
        </>
        )}
      </div>
    </div>
  );
}
