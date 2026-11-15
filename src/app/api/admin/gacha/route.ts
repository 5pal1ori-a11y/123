import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, forbidUnlessStaffCan, isShop, isShopAdmin, requireShop, unauthorized } from "@/lib/api";
import { getGachaConfig, initStore, persistAsync, saveGachaConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 관리자: 랜덤뽑기 가격 · 상품 · 확률 */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  return NextResponse.json({ gacha: getGachaConfig(shop.id) });
}

const schema = z.object({
  price: z.number().int().min(1).max(1_000_000),
  prizes: z
    .array(
      z.object({
        id: z.string().max(40).optional(),
        label: z.string().min(1).max(40),
        weight: z.number().min(0).max(1_000_000),
        points: z.number().int().min(0).max(10_000_000),
      }),
    )
    .min(1)
    .max(20),
});

export async function PUT(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  const denied = forbidUnlessStaffCan(request, shop, "billing");
  if (denied) return denied;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("가격과 상품을 확인해 주세요.");
  try {
    const gacha = saveGachaConfig(shop.id, parsed.data);
    await persistAsync();
    return NextResponse.json({ gacha });
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "저장하지 못했어요.");
  }
}
