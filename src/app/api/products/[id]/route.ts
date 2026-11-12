import { NextResponse } from "next/server";
import { z } from "zod";
import {
  badRequest,
  forbidUnlessStaffCan,
  isShop,
  isShopAdmin,
  notFound,
  requireShop,
  serverError,
  unauthorized,
} from "@/lib/api";
import {
  getProductById,
  getProductBySlug,
  listProducts,
  listProductsAdmin,
  persistAsync,
  updateProduct,
} from "@/lib/store";
import { moderateProductText, moderationUserMessage } from "@/lib/content-moderation";
import { initStore } from "@/lib/store";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;

  const { id } = await context.params;
  const byId = getProductById(id);
  const admin = isShopAdmin(request, shop);
  const product =
    byId && byId.shopId === shop.id
      ? (admin ? listProductsAdmin(shop.id) : listProducts(shop.id)).find((p) => p.id === byId.id)
      : getProductBySlug(shop.id, id);

  if (!product) return notFound("상품을 찾을 수 없습니다.");
  return NextResponse.json({ product });
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  description: z.string().optional(),
  price: z.number().int().nonnegative().optional(),
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
  productKind: z.enum(["general", "mc_account"]).optional(),
  mcNickname: z
    .string()
    .regex(/^[A-Za-z0-9_]{3,16}$/)
    .nullable()
    .optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  const denied = forbidUnlessStaffCan(request, shop, "products");
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const existing = getProductById(id);
    if (!existing || existing.shopId !== shop.id) {
      return notFound("상품을 찾을 수 없습니다.");
    }

    const json = await request.json();
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) return badRequest("잘못된 요청입니다.");

    if (parsed.data.name !== undefined || parsed.data.description !== undefined) {
      const mod = await moderateProductText(
        parsed.data.name ?? existing.name,
        parsed.data.description ?? existing.description,
      );
      if (mod.action === "block") {
        return badRequest(moderationUserMessage(mod, "product") || mod.reason);
      }
    }

    const product = updateProduct(shop.id, id, parsed.data);
    await persistAsync();
    return NextResponse.json({ product });
  } catch (err) {
    return serverError(err);
  }
}
