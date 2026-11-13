import type { Product, ShopEvent, ShopTier } from "@/lib/types";

/** 상품 자체 할인율 (0~90) */
export function productDiscountPercent(product: Pick<Product, "discountPercent">) {
  const d = Math.floor(Number(product.discountPercent ?? 0));
  return Number.isFinite(d) ? Math.max(0, Math.min(90, d)) : 0;
}

/** 상품 할인 + 등급 + 이벤트 할인 (합산, 최대 90%) */
export function calcProductPrice(
  product: Product,
  tier: ShopTier | null,
  event: ShopEvent | null,
): { finalPrice: number; totalDiscountPercent: number } {
  const eventDiscount = event?.discountPercent ?? 0;
  const tierDiscount = tier?.discountPercent ?? 0;
  const totalDiscountPercent = Math.min(90, productDiscountPercent(product) + eventDiscount + tierDiscount);
  const finalPrice = Math.round(product.price * (1 - totalDiscountPercent / 100));
  return { finalPrice, totalDiscountPercent };
}
