import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, isShop, requireShop, serverError } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { getUserById, initStore } from "@/lib/store";
import { buyPremiumWithPoints, PREMIUM_PLANS, premiumBenefits, redeemPremiumKey } from "@/lib/premium";

export const dynamic = "force-dynamic";

/** GET: 플랜 목록 + 내 구독 상태 */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  const me = session ? await premiumBenefits(shop.id, session.user.id) : null;
  const user = session ? getUserById(session.user.id) : null;
  return NextResponse.json(
    {
      plans: Object.values(PREMIUM_PLANS),
      me: me ? { ...me, points: user?.points ?? 0, discordLinked: Boolean(user?.discordId) } : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("buy"), plan: z.enum(["basic", "plus"]) }),
  z.object({ action: z.literal("redeem"), key: z.string().min(8).max(40) }),
]);

export async function POST(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return NextResponse.json({ error: "로그인 후 이용할 수 있어요." }, { status: 401 });
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return badRequest("요청이 올바르지 않아요.");
    if (parsed.data.action === "buy") {
      const r = await buyPremiumWithPoints(shop.id, session.user.id, parsed.data.plan);
      return NextResponse.json({ ok: true, premium: r.premium, plan: r.plan.name, key: r.key });
    }
    const r = await redeemPremiumKey(shop.id, session.user.id, parsed.data.key);
    return NextResponse.json({ ok: true, premium: r.premium, plan: r.plan.name });
  } catch (e) {
    if (e instanceof Error && !/^\[/.test(e.message) && /키|포인트|PASS|로그인|회원/.test(e.message)) return badRequest(e.message);
    return serverError(e);
  }
}
