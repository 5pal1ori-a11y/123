import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore, persistAsync } from "@/lib/store";
import { confirmCoinOrder, getCoinOrder } from "@/lib/coin-trade";

const schema = z.object({ orderId: z.string().min(1).max(60) });

/** 웹 코인대행 — 확정 (포인트 차감 + 관리자 승인 대기) */
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
    if (!parsed.success) return badRequest("요청 형식이 올바르지 않아요.");

    const o = await confirmCoinOrder(shop.id, parsed.data.orderId, session.user.id);
    await persistAsync();

    // 관리자 채널 카드 + 패널 갱신 (디스코드 흐름과 동일)
    try {
      const { announceCoinOrder } = await import("@/lib/discord/coin-trade");
      await announceCoinOrder(shop.id, shop.slug, await getCoinOrder(shop.id, o.id) ?? o).catch(() => {});
    } catch {
      /* 디스코드 미연동 시 무시 */
    }

    return NextResponse.json({ ok: true, orderId: o.id, balance: o.balance });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError(err);
  }
}
