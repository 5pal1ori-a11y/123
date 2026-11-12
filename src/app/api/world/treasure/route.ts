import { NextResponse } from "next/server";
import { badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { treasureFind, treasureState } from "@/lib/world/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    const session = await getUserSession(shop.slug, request);
    if (!session) return unauthorized();
    return NextResponse.json(await treasureState(shop.id, session.user.id));
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
    const body = (await request.json().catch(() => null)) as { spot?: unknown } | null;
    const spot = body?.spot;
    if (typeof spot !== "number" || !Number.isInteger(spot) || spot < 0 || spot > 99) return badRequest("잘못된 요청");
    const result = await treasureFind(shop.id, session.user.id, spot);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json(result);
  } catch (err) {
    return serverError(err);
  }
}
