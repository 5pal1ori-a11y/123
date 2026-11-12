import { NextResponse } from "next/server";
import { z } from "zod";
import {
  badRequest,
  forbidden,
  isShop,
  isShopAdmin,
  isShopOwnerAdmin,
  requireShop,
  serverError,
  unauthorized,
} from "@/lib/api";
import {
  exportShopBackup,
  importShopBackup,
  initStore,
  persistAsync,
} from "@/lib/store";

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  if (!isShopOwnerAdmin(request, shop)) return forbidden("소유자만 백업할 수 있어요.");

  const backup = exportShopBackup(shop.id);
  if (!backup) return NextResponse.json({ error: "백업 실패" }, { status: 500 });
  return NextResponse.json(backup);
}

const importSchema = z.object({
  products: z.array(z.any()).optional(),
  categories: z.array(z.any()).optional(),
  notices: z.array(z.any()).optional(),
  events: z.array(z.any()).optional(),
  tiers: z.array(z.any()).optional(),
  coupons: z.array(z.any()).optional(),
  inventories: z.array(z.any()).optional(),
});

export async function POST(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopOwnerAdmin(request, shop)) return forbidden("소유자만 복원할 수 있어요.");

  try {
    const json = await request.json();
    const parsed = importSchema.safeParse(json);
    if (!parsed.success) return badRequest("백업 형식이 올바르지 않아요.");
    const result = importShopBackup(shop.id, parsed.data);
    if (!result.ok) return badRequest(result.error);
    await persistAsync();
    return NextResponse.json(result);
  } catch (err) {
    return serverError(err);
  }
}
