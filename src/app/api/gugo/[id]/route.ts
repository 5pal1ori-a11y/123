import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore, persistAsync } from "@/lib/store";
import { cancelGugo, payGugo, publicGugo } from "@/lib/gugo";

const schema = z.object({ action: z.enum(["cancel", "pay"]) });

/** 구해드림 취소(수락 전) · 잔금 결제 */
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
    if (!parsed.success) return badRequest("요청 형식이 올바르지 않아요.");
    const r = parsed.data.action === "cancel" ? await cancelGugo(shop.id, id, session.user.id) : await payGugo(shop.id, id, session.user.id);
    await persistAsync();
    try {
      const { patchAdminCard } = await import("@/lib/discord/gugo");
      await patchAdminCard(shop.id, shop.slug, r);
    } catch {
      /* 디스코드 미연동 */
    }
    return NextResponse.json({ ok: true, request: publicGugo(r) });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError(err);
  }
}
