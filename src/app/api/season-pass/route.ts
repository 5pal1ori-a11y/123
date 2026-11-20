import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { buyPass, claimAll, currentSeason, MAX_LEVEL, PASS_PRICE, PASS_XP_BOOST, passState, rewardLabel, seasonTiers, XP_PER_LEVEL, XP_RULES } from "@/lib/season-pass";

/** 내 시즌패스 (로그인 안 했으면 보상표만) */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const base = { rules: XP_RULES, price: PASS_PRICE, boost: PASS_XP_BOOST, maxLevel: MAX_LEVEL, xpPerLevel: XP_PER_LEVEL };
  try {
    const session = await getUserSession(shop.slug, request);
    if (!session) {
      return NextResponse.json({
        ...base,
        loggedIn: false,
        season: currentSeason(),
        tiers: seasonTiers().map((t) => ({ level: t.level, free: { ...t.free, label: rewardLabel(t.free), state: "locked" }, pass: { ...t.pass, label: rewardLabel(t.pass), state: "nopass" } })),
      });
    }
    return NextResponse.json({ ...base, loggedIn: true, points: session.user.points, ...(await passState(shop.id, session.user.id)) });
  } catch (err) {
    return serverError(err);
  }
}

const schema = z.object({ action: z.enum(["buy", "claim"]) });

export async function POST(request: Request) {
  await initStore();
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("입력을 확인해 주세요.");
  try {
    if (parsed.data.action === "buy") return NextResponse.json({ ok: true, ...(await buyPass(shop.id, session.user.id)) });
    return NextResponse.json({ ok: true, ...(await claimAll(shop.id, session.user.id)) });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError(err);
  }
}
