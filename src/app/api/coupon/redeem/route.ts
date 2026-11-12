import { NextResponse } from "next/server";
import { badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { getUserSession } from "@/lib/session-server";
import { initStore, persistAsync } from "@/lib/store";
import { redeemWorldCoupon } from "@/lib/world/server";

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
    const body = (await request.json().catch(() => null)) as { code?: string } | null;
    if (!body?.code?.trim()) return badRequest("쿠폰 번호를 입력해 주세요");
    const result = await redeemWorldCoupon(shop.id, session.user.id, body.code.slice(0, 40));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    await persistAsync();
    return NextResponse.json(result);
  } catch (err) {
    return serverError(err);
  }
}
