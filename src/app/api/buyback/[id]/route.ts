import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { cancelBuyback, handoverBuyback, publicBuyback, respondBuyback } from "@/lib/buyback";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("decline") }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("handover"), email: z.string().min(3).max(120), password: z.string().min(1).max(200), extra: z.string().max(500).optional() }),
]);

/** 손님: 제시가 수락 · 거절 · 취소 · 로그인 정보 제출 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  await initStore();
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();
  const { id } = await ctx.params;
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badRequest("입력을 확인해 주세요.");
    const d = parsed.data;
    const uid = session.user.id;
    const b =
      d.action === "accept" || d.action === "decline"
        ? await respondBuyback(shop.id, id, uid, d.action === "accept")
        : d.action === "cancel"
          ? await cancelBuyback(shop.id, id, uid)
          : await handoverBuyback(shop.id, id, uid, { email: d.email, password: d.password, extra: d.extra });
    try {
      const { patchBuybackCard } = await import("@/lib/discord/buyback");
      await patchBuybackCard(shop.id, shop.slug, b, d.action === "handover" ? "손님이 로그인 정보를 냈어요 — [로그인 정보 보기]로 확인" : undefined);
    } catch {
      /* 디스코드 미연동 */
    }
    return NextResponse.json({ ok: true, request: publicBuyback(b) });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError(err);
  }
}
