import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore, listWishlistProductIds, toggleWishlist } from "@/lib/store";

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug);
  if (!session) return unauthorized();
  return NextResponse.json({ productIds: listWishlistProductIds(shop.id, session.user.id) });
}

const toggleSchema = z.object({ productId: z.string().min(1) });

export async function POST(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug);
  if (!session) return unauthorized();

  try {
    const json = await request.json();
    const parsed = toggleSchema.safeParse(json);
    if (!parsed.success) return badRequest("상품 ID 필요");
    const result = toggleWishlist(shop.id, session.user.id, parsed.data.productId);
    return NextResponse.json(result);
  } catch (err) {
    return serverError(err);
  }
}
