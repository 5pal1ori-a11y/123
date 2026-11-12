import { NextResponse } from "next/server";
import { z } from "zod";
import {
  badRequest,
  forbidUnlessStaffCan,
  isShop,
  isShopAdmin,
  requireShop,
  serverError,
  unauthorized,
} from "@/lib/api";
import { createProduct, initStore, listProducts, listProductsAdmin, persistAsync } from "@/lib/store";
import { moderateProductText, moderationUserMessage } from "@/lib/content-moderation";
import { refreshMfaStockIfStale } from "@/lib/mfa";

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;

  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all") === "1";
  await refreshMfaStockIfStale(shop.id);
  if (all) {
    if (!isShopAdmin(request, shop)) return unauthorized();
    return NextResponse.json({ products: listProductsAdmin(shop.id) });
  }

  return NextResponse.json({ products: listProducts(shop.id) });
}

const createSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().optional(),
  price: z.number().int().nonnegative(),
  category: z.string().optional(),
  thumbnail: z.string().nullable().optional(),
  active: z.boolean().optional(),
  purchaseLimitPerUser: z.number().int().positive().nullable().optional(),
  tags: z.array(z.string().min(1).max(32)).max(12).optional(),
  discordRoleId: z.string().nullable().optional(),
  mfaProduct: z.string().max(40).nullable().optional(),
  listingKind: z.enum(["vending", "individual"]).optional(),
  fulfillment: z.enum(["auto", "manual"]).optional(),
  manualNotice: z.string().max(800).nullable().optional(),
  stockBoardHidden: z.boolean().optional(),
});

export async function POST(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  const denied = forbidUnlessStaffCan(request, shop, "products");
  if (denied) return denied;

  try {
    const json = await request.json();
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return badRequest("상품 데이터가 올바르지 않아요. slug는 영문·숫자·하이픈만 가능합니다.");
    }

    const mod = await moderateProductText(parsed.data.name, parsed.data.description);
    if (mod.action === "block") {
      return badRequest(moderationUserMessage(mod, "product") || mod.reason);
    }

    const product = createProduct(shop.id, parsed.data);
    await persistAsync();
    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "서버 오류";
    if (message.includes("플랜") || message.includes("slug") || message.includes("상점")) {
      return badRequest(message);
    }
    return serverError(err);
  }
}
