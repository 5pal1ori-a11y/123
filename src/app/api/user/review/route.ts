import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, badRequest, isShop, requireShop, unauthorized } from "@/lib/api";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getUserSession } from "@/lib/session-server";
import { initStore, listUserOrders, persistAsync } from "@/lib/store";
import { submitPurchaseReview } from "@/lib/store-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  orderId: z.string().min(1).max(64),
  body: z.string().min(1).max(500),
});

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();

  const rl = rateLimit(`review:${shop.id}:${session.user.id}`, 10, 10 * 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("후기 내용을 확인해 주세요.");

  const order = listUserOrders(shop.id, session.user.id).find((o) => o.id === parsed.data.orderId);
  if (!order?.productId) return badRequest("구매 내역을 찾을 수 없어요.");

  const result = submitPurchaseReview(shop.id, session.user.id, order.productId, parsed.data.body);
  if (!result.ok) return badRequest(result.error);
  await persistAsync();
  return NextResponse.json({ ok: true });
}
