import { NextResponse } from "next/server";
import { badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { getUserSession } from "@/lib/session-server";
import { applyReferralCode, getReferralSummary, initStore, persistAsync } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    const session = await getUserSession(shop.slug, request);
    if (!session) return unauthorized();
    const summary = getReferralSummary(shop.id, session.user.id);
    if (!summary) return unauthorized();
    await persistAsync();
    return NextResponse.json(summary);
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
    const body = (await request.json().catch(() => null)) as { code?: string } | null;
    if (!body?.code?.trim()) return badRequest("추천인 코드를 입력해 주세요.");
    const result = applyReferralCode(shop.id, session.user.id, body.code.slice(0, 20));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    await persistAsync();
    return NextResponse.json({ ...result, summary: getReferralSummary(shop.id, session.user.id) });
  } catch (err) {
    return serverError(err);
  }
}
