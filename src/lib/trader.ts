import { getProductById, getShopSettings, updateShopSettings } from "@/lib/store";
import type { TraderDeal } from "@/lib/types";

export type PublicTraderDeal = {
  id: string;
  productId: string;
  productName: string;
  thumbnail: string | null;
  originalPrice: number;
  dealPrice: number;
  quantity: number;
  remaining: number;
  startsAt: string;
  endsAt: string;
  bought: boolean;
};

export type TraderDealInput = {
  productId: string;
  dealPrice: number;
  quantity: number;
  minutes: number;
  startInMinutes?: number;
};

const ms = (iso: string) => new Date(iso).getTime();

export function currentTraderDeal(shopId: string): TraderDeal | null {
  return getShopSettings(shopId).traderDeal ?? null;
}

/** 지금 판매 중인 Deal (시작 전·종료 후면 null) */
export function activeTraderDeal(shopId: string, now = Date.now()): TraderDeal | null {
  const deal = currentTraderDeal(shopId);
  if (!deal) return null;
  if (now < ms(deal.startsAt) || now >= ms(deal.endsAt)) return null;
  return deal;
}

export function publicTraderDeal(shopId: string, userId?: string | null): PublicTraderDeal | null {
  const deal = activeTraderDeal(shopId);
  if (!deal) return null;
  const product = getProductById(deal.productId);
  if (!product || product.shopId !== shopId || !product.active) return null;
  return {
    id: deal.id,
    productId: deal.productId,
    productName: product.name,
    thumbnail: product.thumbnail,
    originalPrice: deal.originalPrice,
    dealPrice: deal.dealPrice,
    quantity: deal.quantity,
    remaining: Math.max(0, deal.quantity - deal.sold),
    startsAt: deal.startsAt,
    endsAt: deal.endsAt,
    bought: Boolean(userId && deal.buyers.includes(userId)),
  };
}

export function setTraderDeal(shopId: string, input: TraderDealInput): { ok: true; deal: TraderDeal } | { ok: false; error: string } {
  const product = getProductById(input.productId);
  if (!product || product.shopId !== shopId) return { ok: false, error: "상품을 찾을 수 없어요" };
  if (!product.active) return { ok: false, error: "판매 중인 상품만 Deal로 올릴 수 있어요" };
  const dealPrice = Math.floor(input.dealPrice);
  if (dealPrice < 0) return { ok: false, error: "Deal 가격을 확인하세요" };
  if (dealPrice >= product.price) return { ok: false, error: "Deal 가격은 원래 가격보다 낮아야 해요" };
  const now = Date.now();
  const startsAt = new Date(now + Math.max(0, input.startInMinutes ?? 0) * 60_000);
  const endsAt = new Date(startsAt.getTime() + input.minutes * 60_000);
  const deal: TraderDeal = {
    id: crypto.randomUUID(),
    productId: product.id,
    originalPrice: product.price,
    dealPrice,
    quantity: Math.max(1, Math.floor(input.quantity)),
    sold: 0,
    buyers: [],
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    createdAt: new Date(now).toISOString(),
  };
  updateShopSettings(shopId, { traderDeal: deal });
  return { ok: true, deal };
}

export function clearTraderDeal(shopId: string) {
  updateShopSettings(shopId, { traderDeal: null });
}

/** 구매 전에 수량을 먼저 잡아둔다 (동시 구매로 초과 판매 방지) */
export function reserveTraderDeal(shopId: string, userId: string): { ok: true; deal: TraderDeal } | { ok: false; error: string } {
  const deal = activeTraderDeal(shopId);
  if (!deal) return { ok: false, error: "상인이 이미 떠났어요" };
  if (deal.buyers.includes(userId)) return { ok: false, error: "이번 Deal은 1인 1회만 구매할 수 있어요" };
  if (deal.sold >= deal.quantity) return { ok: false, error: "준비된 수량이 모두 팔렸어요" };
  deal.sold += 1;
  deal.buyers.push(userId);
  return { ok: true, deal };
}

export function releaseTraderDeal(shopId: string, dealId: string, userId: string) {
  const deal = currentTraderDeal(shopId);
  if (!deal || deal.id !== dealId) return;
  deal.sold = Math.max(0, deal.sold - 1);
  deal.buyers = deal.buyers.filter((id) => id !== userId);
}
