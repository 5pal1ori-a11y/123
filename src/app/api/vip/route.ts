import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { openVipChannel, requestConcierge, VIP_TIERS, vipStatus } from "@/lib/vip";

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const tiers = VIP_TIERS.map((t) => ({ id: t.id, name: t.name, min: t.min, perks: t.perks }));
  const session = await getUserSession(shop.slug, request);
  if (!session) return NextResponse.json({ tiers, loggedIn: false });
  try {
    return NextResponse.json({ tiers, loggedIn: true, hasDiscord: Boolean(session.user.discordId), ...(await vipStatus(shop.id, session.user.id)) });
  } catch (err) {
    return serverError(err);
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("channel") }),
  z.object({ action: z.literal("request"), text: z.string().min(5).max(800), budget: z.number().int().min(0).max(100_000_000).optional() }),
]);

export async function POST(request: Request) {
  await initStore();
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("원하는 계정 조건을 5자 이상 적어 주세요.");
  try {
    if (parsed.data.action === "channel") return NextResponse.json({ ok: true, ...(await openVipChannel(shop.id, session.user.id)) });
    const r = await requestConcierge(shop.id, session.user.id, parsed.data.text, parsed.data.budget ?? null);
    return NextResponse.json({ ok: true, request: r });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError(err);
  }
}
