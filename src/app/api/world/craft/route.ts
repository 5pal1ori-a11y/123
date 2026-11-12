import { NextResponse } from "next/server";
import { badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { evaluateShopVisitorAccess } from "@/lib/access-guard";
import { assertSameOrigin } from "@/lib/csrf";
import { purchaseWithPointsSmart } from "@/lib/mfa";
import { getUserSession } from "@/lib/session-server";
import { getShopSettings, initStore, persistAsync } from "@/lib/store";
import { grantAdvancements, recipeById, refundTokens, spendTokens } from "@/lib/world/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    const session = await getUserSession(shop.slug, request);
    if (!session) return unauthorized();
    const access = await evaluateShopVisitorAccess(request, getShopSettings(shop.id));
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: 403 });

    const body = (await request.json().catch(() => null)) as { recipeId?: string } | null;
    const found = body?.recipeId ? recipeById(shop.id, body.recipeId) : null;
    if (!found) return badRequest("없는 제작법이에요");
    const { recipe, product } = found;

    const spent = await spendTokens(shop.id, session.user.id, recipe.tokens, `제작 · ${product.name}`);
    if (!spent.ok) return NextResponse.json({ error: spent.error }, { status: 409 });

    let result: Awaited<ReturnType<typeof purchaseWithPointsSmart>>;
    try {
      result = await purchaseWithPointsSmart(shop.id, session.user.id, product.id, { unitPriceOverride: 0 });
    } catch (err) {
      await refundTokens(shop.id, session.user.id, recipe.tokens, `제작 실패 환불 · ${product.name}`);
      throw err;
    }
    if (!result.ok) {
      await refundTokens(shop.id, session.user.id, recipe.tokens, `제작 실패 환불 · ${product.name}`);
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    await persistAsync();
    const adv = await grantAdvancements(shop.id, session.user.id, ["craft"]).catch(() => []);
    return NextResponse.json({
      order: result.order,
      links: result.links ?? [],
      tokens: spent.tokens,
      product: { id: product.id, name: product.name },
      adv,
    });
  } catch (err) {
    return serverError(err);
  }
}
