import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore, persistAsync } from "@/lib/store";
import { createGugo, depositFor, GUGO_DEADLINES, GUGO_DEPOSIT_PERCENT, GUGO_MAX_BUDGET, GUGO_MIN_BUDGET, listGugo, publicGugo } from "@/lib/gugo";

/** 내 구해드림 목록 */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();
  try {
    const mine = (await listGugo(shop.id)).filter((r) => r.userId === session.user.id).slice(0, 30).map(publicGugo);
    return NextResponse.json({
      requests: mine,
      points: session.user.points,
      rules: { depositPercent: GUGO_DEPOSIT_PERCENT, minBudget: GUGO_MIN_BUDGET, maxBudget: GUGO_MAX_BUDGET, deadlines: GUGO_DEADLINES },
    });
  } catch (err) {
    return serverError(err);
  }
}

const schema = z.object({ wish: z.string().min(4).max(300), budget: z.number().int(), deadlineDays: z.number().int() });

/** 구해드림 신청 — 선금 차감 */
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
    if (!parsed.success) return badRequest("입력을 확인해 주세요.");
    const r = await createGugo(shop.id, { id: session.user.id, discordId: session.user.discordId }, parsed.data);
    await persistAsync();
    try {
      const { postAdminCard } = await import("@/lib/discord/gugo");
      await postAdminCard(shop.id, shop.slug, r);
    } catch {
      /* 디스코드 미연동 */
    }
    return NextResponse.json({ ok: true, request: publicGugo(r), balance: r.balance, deposit: depositFor(r.budget) });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError(err);
  }
}
