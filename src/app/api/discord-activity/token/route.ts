import { NextResponse } from "next/server";
import { z } from "zod";
import { exchangeActivityCode, signActivitySession } from "@/lib/discord-activity";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-meta";
import { getShopBySlug, getUserByDiscordId, initStore, MFA_SHOP_SLUG } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 액티비티 로그인 — authorize code → access_token(SDK authenticate 용) + DOES 세션 */
export async function POST(request: Request) {
  const rl = rateLimit(`activity:token:${clientIp(request)}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "잠시 뒤에 다시 시도해 주세요." }, { status: 429 });
  const parsed = z.object({ code: z.string().min(5).max(200) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "로그인 정보가 올바르지 않아요." }, { status: 400 });
  try {
    const { accessToken, discord } = await exchangeActivityCode(parsed.data.code);
    await initStore();
    const shop = getShopBySlug(MFA_SHOP_SLUG);
    const user = shop ? getUserByDiscordId(shop.id, discord.id) : null;
    return NextResponse.json({
      access_token: accessToken,
      discord,
      linked: Boolean(user && !user.banned),
      session: user && !user.banned ? signActivitySession(user.id, discord.id) : null,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "로그인하지 못했어요." }, { status: 400 });
  }
}
