import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSameOrigin,
  badRequest,
  forbidUnlessStaffCan,
  isShop,
  isShopAdmin,
  requireShop,
  serverError,
  unauthorized,
} from "@/lib/api";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { isProduction, sanitizeOrder } from "@/lib/security";
import { DISCORD_LINK_REQUIRED, isMfaShopSlug } from "@/lib/discord/does-env";
import { getUserSession } from "@/lib/session-server";
import { createOrder, getProductById, initStore, listOrders, persistAsync } from "@/lib/store";

const bodySchema = z.object({
  productId: z.string().min(1),
  buyerEmail: z.string().email(),
  paymentMethod: z.enum(["card", "transfer", "crypto", "demo"]).default("transfer"),
  quantity: z.number().int().min(1).max(99).optional(),
});

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  const denied = forbidUnlessStaffCan(request, shop, "orders");
  if (denied) return denied;

  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "40");
  const all = listOrders(shop.id);
  return NextResponse.json({
    orders: (limit === 0 ? all : all.slice(0, Number.isFinite(limit) ? limit : 40)).map((o) => ({
      ...sanitizeOrder(o, { includeCode: true }),
      productName: getProductById(o.productId)?.name ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;

  // 비회원 주문은 재고만 잠그고 끝날 수 있어서 로그인한 이용자만 받는다
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();
  if (isMfaShopSlug(shop.slug) && !session.user.discordId) {
    return NextResponse.json({ error: DISCORD_LINK_REQUIRED, code: "discord_link_required" }, { status: 403 });
  }
  const rl = rateLimit(`order-create:${shop.id}:${session.user.id}`, 10, 10 * 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  const unpaid = listOrders(shop.id).filter(
    (o) => o.userId === session.user.id && (o.status === "locked" || o.status === "pending"),
  ).length;
  if (unpaid >= 3) {
    return NextResponse.json(
      { error: "입금 확인을 기다리는 주문이 3건 있어요. 처리된 뒤 다시 주문해 주세요." },
      { status: 409 },
    );
  }

  try {
    const json = await request.json();
    if ((json as { agreeTerms?: unknown })?.agreeTerms !== true) {
      return NextResponse.json({ error: "이용약관과 개인정보처리방침에 동의해 주세요.", code: "terms_required" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return badRequest("잘못된 요청입니다.");

    if (parsed.data.paymentMethod === "demo" && isProduction()) {
      return badRequest("데모 결제는 사용할 수 없습니다.");
    }

    const result = createOrder({
      shopId: shop.id,
      ...parsed.data,
      buyerEmail: session.user.email || parsed.data.buyerEmail,
      userId: session.user.id,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    await persistAsync();

    const accessToken = result.order.accessToken;
    return NextResponse.json(
      {
        order: sanitizeOrder(result.order),
        accessToken,
      },
      { status: 201 },
    );
  } catch (err) {
    return serverError(err);
  }
}
