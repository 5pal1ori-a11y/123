import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { buyerPurchases, reportDispute } from "@/lib/dosmarket";
import { DOSMARKET_HOLD_HOURS } from "@/lib/resale-shared";

/** 내가 산 도스마켓 계정 (구매자 보호 · 신고) */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return NextResponse.json({ loggedIn: false, purchases: [], holdHours: DOSMARKET_HOLD_HOURS });
  try {
    return NextResponse.json({ loggedIn: true, purchases: await buyerPurchases(shop.id, session.user.id), holdHours: DOSMARKET_HOLD_HOURS });
  } catch (err) {
    return serverError(err);
  }
}

const schema = z.object({ requestId: z.string().min(1).max(60), reason: z.string().min(5).max(500) });

/** 구매자 문제 신고 — 보호 기간 안이면 판매자 정산을 멈춘다 */
export async function POST(request: Request) {
  await initStore();
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badRequest("어떤 문제인지 5자 이상 적어 주세요.");
    await reportDispute(shop.id, session.user.id, parsed.data.requestId, parsed.data.reason);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError(err);
  }
}
