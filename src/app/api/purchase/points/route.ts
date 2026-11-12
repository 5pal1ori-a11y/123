import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { evaluateShopVisitorAccess } from "@/lib/access-guard";
import { DISCORD_LINK_REQUIRED, isMfaShopSlug } from "@/lib/discord/does-env";
import { getUserSession } from "@/lib/session-server";
import { purchaseCartWithPointsSmart, purchaseWithPointsSmart } from "@/lib/mfa";
import { getShopSettings, initStore, persistAsync } from "@/lib/store";

const TERMS_REQUIRED = "이용약관과 개인정보처리방침에 동의해 주세요.";

const schema = z.union([
  z.object({ productId: z.string().min(1) }),
  z.object({
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().int().min(1).max(99),
        }),
      )
      .min(1)
      .max(30),
  }),
]);

export async function POST(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();
  if (isMfaShopSlug(shop.slug) && !session.user.discordId) {
    return NextResponse.json({ error: DISCORD_LINK_REQUIRED, code: "discord_link_required" }, { status: 403 });
  }

  const settings = getShopSettings(shop.id);
  const access = await evaluateShopVisitorAccess(request, settings);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }

  try {
    const json = await request.json();
    if ((json as { agreeTerms?: unknown })?.agreeTerms !== true) {
      return NextResponse.json({ error: TERMS_REQUIRED, code: "terms_required" }, { status: 400 });
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) return badRequest("상품을 선택하세요.");

    if ("items" in parsed.data) {
      const result = await purchaseCartWithPointsSmart(shop.id, session.user.id, parsed.data.items);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
      await persistAsync();
      return NextResponse.json({
        orders: result.orders,
        total: result.total,
        order: result.orders[0] ?? null,
        ...(result.partialError ? { partialError: result.partialError } : {}),
      });
    }

    const result = await purchaseWithPointsSmart(shop.id, session.user.id, parsed.data.productId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    await persistAsync();
    return NextResponse.json({ order: result.order, orders: [result.order] });
  } catch (err) {
    return serverError(err);
  }
}
