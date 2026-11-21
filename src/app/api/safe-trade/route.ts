import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore, userPremiumPlan } from "@/lib/store";
import { createSafeTrade, mySafeTrades, SAFE_FEE_PERCENT, SAFE_FEE_PERCENT_PLUS, SAFE_HOLD_HOURS, SAFE_OPEN_DAYS, safeUrl } from "@/lib/safe-trade";

/** 내 안전거래 (판매 · 구매) */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const base = { fee: SAFE_FEE_PERCENT, feePlus: SAFE_FEE_PERCENT_PLUS, holdHours: SAFE_HOLD_HOURS, openDays: SAFE_OPEN_DAYS };
  const session = await getUserSession(shop.slug, request);
  if (!session) return NextResponse.json({ ...base, loggedIn: false, trades: [] });
  try {
    return NextResponse.json({ ...base, loggedIn: true, myFee: userPremiumPlan(session.user) === "plus" ? SAFE_FEE_PERCENT_PLUS : SAFE_FEE_PERCENT, trades: await mySafeTrades(shop.id, session.user.id) });
  } catch (err) {
    return serverError(err);
  }
}

const schema = z.object({
  title: z.string().min(2).max(60),
  description: z.string().max(1000).default(""),
  price: z.number().int().min(1000).max(5_000_000),
  login: z.object({ email: z.string().min(3).max(120), password: z.string().min(1).max(200), extra: z.string().max(500).optional() }),
  payoutMethod: z.enum(["points", "bank"]),
  payoutAccount: z.string().max(100).optional(),
});

/** 링크 만들기 */
export async function POST(request: Request) {
  await initStore();
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("입력을 확인해 주세요. (가격은 1,000원 이상)");
  const d = parsed.data;
  try {
    const t = await createSafeTrade(
      shop.id,
      { id: session.user.id, name: session.user.name || "회원", discordId: session.user.discordId ?? null, plus: userPremiumPlan(session.user) === "plus" },
      { title: d.title, description: d.description, price: d.price, cred: d.login, payoutMethod: d.payoutMethod, payoutAccount: d.payoutAccount ?? null },
    );
    return NextResponse.json({ ok: true, id: t.id, url: safeUrl(t.id) });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError(err);
  }
}
