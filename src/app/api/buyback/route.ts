import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore, listProducts } from "@/lib/store";
import { createBuyback, listBuybacks, publicBuyback, TRADEIN_BONUS_PERCENT } from "@/lib/buyback";
import { identityVerifyRequired, isUserVerified } from "@/lib/identity-verify";

/** 내 매입 신청 + 보상판매로 고를 수 있는 판매 계정 */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();
  try {
    const mine = (await listBuybacks(shop.id)).filter((b) => b.userId === session.user.id).slice(0, 30).map(publicBuyback);
    const products = listProducts(shop.id)
      .filter((p) => p.active && p.productKind === "mc_account" && p.availableCount > 0)
      .map((p) => ({ id: p.id, name: p.mcMaskedName || p.name, price: Math.round(p.price * (1 - Math.min(90, Math.max(0, Number(p.discountPercent) || 0)) / 100)), category: p.category }))
      .sort((a, b) => a.price - b.price)
      .slice(0, 200);
    return NextResponse.json({ requests: mine, products, bonusPercent: TRADEIN_BONUS_PERCENT, points: session.user.points });
  } catch (err) {
    return serverError(err);
  }
}

const schema = z.object({
  nickname: z.string().min(3).max(16),
  kind: z.enum(["buyback", "tradein"]),
  payout: z.enum(["points", "cash"]),
  bank: z.object({ name: z.string().max(30), account: z.string().max(40), holder: z.string().max(30) }).nullable().optional(),
  targetProductId: z.string().max(60).nullable().optional(),
  note: z.string().max(300).optional(),
  agree: z.literal(true),
});

/** 매입 · 보상판매 신청 */
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
    if (!parsed.success) return badRequest("입력을 확인하고, 본인 계정이라는 데 동의해 주세요.");
    if ((await identityVerifyRequired(shop.id)) && !(await isUserVerified(shop.id, session.user.id))) {
      return NextResponse.json({ needVerify: true, error: "계정 매입은 본인인증을 마친 뒤 신청할 수 있어요." }, { status: 403 });
    }
    const b = await createBuyback(shop.id, { id: session.user.id, discordId: session.user.discordId }, parsed.data);
    try {
      const { postBuybackCard } = await import("@/lib/discord/buyback");
      await postBuybackCard(shop.id, shop.slug, b);
    } catch {
      /* 디스코드 미연동 */
    }
    return NextResponse.json({ ok: true, request: publicBuyback(b) });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError(err);
  }
}
