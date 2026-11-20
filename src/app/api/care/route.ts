import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore, persistAsync } from "@/lib/store";
import { cancelCare, CARE_CLAIM_COOLDOWN_DAYS, CARE_PLANS, CARE_WAIT_DAYS, claimableOrders, CLAIM_TYPES, fileClaim, getMyCare, isCovered, subscribeCare } from "@/lib/care";

/** 내 케어 상태 · 보상 신청 · 신청 가능한 계정 */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  const base = { plans: Object.values(CARE_PLANS), waitDays: CARE_WAIT_DAYS, cooldownDays: CARE_CLAIM_COOLDOWN_DAYS, claimTypes: CLAIM_TYPES };
  if (!session) return NextResponse.json({ ...base, loggedIn: false });
  try {
    const { sub, claims } = await getMyCare(shop.id, session.user.id);
    return NextResponse.json({
      ...base,
      loggedIn: true,
      points: session.user.points,
      sub: sub ? { ...sub, covered: isCovered(sub), waiting: Date.now() < Date.parse(sub.coveredFrom) } : null,
      claims,
      orders: await claimableOrders(shop.id, session.user.id),
    });
  } catch (err) {
    return serverError(err);
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("subscribe"), plan: z.enum(["basic", "plus"]) }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("claim"), orderId: z.string().min(1).max(80), type: z.enum(["lock", "theft", "ban"]), description: z.string().min(10).max(600) }),
]);

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
    if (!parsed.success) return badRequest("입력을 확인해 주세요. (설명은 10자 이상)");
    const d = parsed.data;
    const user = { id: session.user.id, discordId: session.user.discordId };
    if (d.action === "subscribe") {
      const r = await subscribeCare(shop.id, user, d.plan);
      await persistAsync();
      return NextResponse.json({ ok: true, charged: r.charged, balance: r.balance });
    }
    if (d.action === "cancel") {
      await cancelCare(shop.id, user.id);
      return NextResponse.json({ ok: true });
    }
    const c = await fileClaim(shop.id, user, { orderId: d.orderId, type: d.type, description: d.description });
    try {
      const { postClaimCard } = await import("@/lib/discord/care");
      await postClaimCard(shop.id, shop.slug, c);
    } catch {
      /* 디스코드 미연동 */
    }
    return NextResponse.json({ ok: true, claim: c });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError(err);
  }
}
