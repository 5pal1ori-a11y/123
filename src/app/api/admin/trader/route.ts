import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, forbidden, isShop, isShopOwnerAdmin, requireShop, serverError } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { initStore, persistAsync } from "@/lib/store";
import { clearTraderDeal, currentTraderDeal, setTraderDeal } from "@/lib/trader";

export const dynamic = "force-dynamic";

const schema = z.object({
  productId: z.string().min(1),
  dealPrice: z.number().int().min(0),
  quantity: z.number().int().min(1).max(999),
  minutes: z.number().int().min(1).max(60 * 24 * 7),
  startInMinutes: z.number().int().min(0).max(60 * 24 * 7).optional(),
});

function adminDeal(shopId: string) {
  const deal = currentTraderDeal(shopId);
  if (!deal) return null;
  const { buyers, ...rest } = deal;
  return { ...rest, buyerCount: buyers.length };
}

export async function GET(request: Request) {
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    if (!isShopOwnerAdmin(request, shop)) return forbidden("상점 소유자만 가능합니다.");
    return NextResponse.json({ deal: adminDeal(shop.id) }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return serverError(err);
  }
}

export async function PUT(request: Request) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    if (!isShopOwnerAdmin(request, shop)) return forbidden("상점 소유자만 가능합니다.");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badRequest("Deal 설정값을 확인하세요.");
    const result = setTraderDeal(shop.id, parsed.data);
    if (!result.ok) return badRequest(result.error);
    await persistAsync();
    return NextResponse.json({ deal: adminDeal(shop.id) });
  } catch (err) {
    return serverError(err);
  }
}

export async function DELETE(request: Request) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    if (!isShopOwnerAdmin(request, shop)) return forbidden("상점 소유자만 가능합니다.");
    clearTraderDeal(shop.id);
    await persistAsync();
    return NextResponse.json({ deal: null });
  } catch (err) {
    return serverError(err);
  }
}
