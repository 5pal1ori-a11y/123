import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-meta";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { cancelSafeTrade, confirmSafeTrade, disputeSafeTrade, getSafeDb, paySafeTrade, SAFE_HOLD_HOURS, viewTrade } from "@/lib/safe-trade";

/** 링크 정보 — 로그인 정보는 결제한 구매자에게만 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const { id } = await params;
  const rl = await rateLimit(`safe:get:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "잠시 뒤에 다시 시도해 주세요." }, { status: 429 });
  try {
    const t = (await getSafeDb(shop.id)).trades.find((x) => x.id === id.toUpperCase());
    if (!t) return NextResponse.json({ error: "없는 안전거래 링크예요." }, { status: 404 });
    const session = await getUserSession(shop.slug, request);
    return NextResponse.json({ trade: viewTrade(t, session?.user.id ?? null), loggedIn: Boolean(session), points: session?.user.points ?? null, holdHours: SAFE_HOLD_HOURS });
  } catch (err) {
    return serverError(err);
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pay") }),
  z.object({ action: z.literal("confirm") }),
  z.object({ action: z.literal("dispute"), reason: z.string().min(5).max(500) }),
  z.object({ action: z.literal("cancel") }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await initStore();
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();
  const { id: raw } = await params;
  const id = raw.toUpperCase();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("입력을 확인해 주세요. (신고 내용은 5자 이상)");
  const d = parsed.data;
  const me = session.user.id;
  try {
    if (d.action === "pay") await paySafeTrade(shop.id, { id: me, name: session.user.name || "회원", discordId: session.user.discordId ?? null }, id);
    else if (d.action === "confirm") await confirmSafeTrade(shop.id, me, id);
    else if (d.action === "dispute") await disputeSafeTrade(shop.id, me, id, d.reason);
    else await cancelSafeTrade(shop.id, me, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError(err);
  }
}
