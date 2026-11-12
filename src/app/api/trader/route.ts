import { NextResponse } from "next/server";
import { isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { evaluateShopVisitorAccess } from "@/lib/access-guard";
import { assertSameOrigin } from "@/lib/csrf";
import { grantIslandReward } from "@/lib/island/server";
import { decoForKey, ITEMS } from "@/lib/island/world";
import { purchaseWithPointsSmart } from "@/lib/mfa";
import { getUserSession } from "@/lib/session-server";
import { getShopSettings, initStore, persistAsync } from "@/lib/store";
import { publicTraderDeal, releaseTraderDeal, reserveTraderDeal } from "@/lib/trader";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    const session = await getUserSession(shop.slug, request);
    return NextResponse.json(
      { deal: publicTraderDeal(shop.id, session?.user.id), now: new Date().toISOString() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return serverError(err);
  }
}

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

    const reserved = reserveTraderDeal(shop.id, session.user.id);
    if (!reserved.ok) return NextResponse.json({ error: reserved.error }, { status: 409 });
    const { deal } = reserved;

    let result: Awaited<ReturnType<typeof purchaseWithPointsSmart>>;
    try {
      result = await purchaseWithPointsSmart(shop.id, session.user.id, deal.productId, {
        unitPriceOverride: deal.dealPrice,
      });
    } catch (err) {
      releaseTraderDeal(shop.id, deal.id, session.user.id);
      throw err;
    }
    if (!result.ok) {
      releaseTraderDeal(shop.id, deal.id, session.user.id);
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    await persistAsync();

    const deco = decoForKey(deal.id);
    await grantIslandReward(shop.id, session.user.id, `t:${deal.id}`, deco).catch((err) =>
      console.error("[trader] island reward failed", err),
    );

    return NextResponse.json({
      order: result.order,
      reward: ITEMS[deco].label,
      deal: publicTraderDeal(shop.id, session.user.id),
    });
  } catch (err) {
    return serverError(err);
  }
}
