import type { Product, ShopEvent, ShopTier } from "@/lib/types";

/** 등급 + 이벤트 할인 (합산, 최대 90%) */
export function calcProductPrice(
  product: Product,
  tier: ShopTier | null,
  event: ShopEvent | null,
): { finalPrice: number; totalDiscountPercent: number } {
  const eventDiscount = event?.discountPercent ?? 0;
  const tierDiscount = tier?.discountPercent ?? 0;
  const totalDiscountPercent = Math.min(90, eventDiscount + tierDiscount);
  const finalPrice = Math.round(product.price * (1 - totalDiscountPercent / 100));
  return { finalPrice, totalDiscountPercent };
}
