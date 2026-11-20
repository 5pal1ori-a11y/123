import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { extendRental, getRentalDb, myRentals, publicItem, rentItem, returnEarly } from "@/lib/rental";

/** 렌탈 상품 목록 · 내 대여 · 1일권 */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  try {
    const db = await getRentalDb(shop.id);
    const items = db.items.filter((i) => i.status !== "hidden").map((i) => publicItem(i, Date.now(), db));
    const session = await getUserSession(shop.slug, request);
    if (!session) return NextResponse.json({ items, loggedIn: false });
    return NextResponse.json({ items, loggedIn: true, points: session.user.points, tickets: db.tickets[session.user.id] ?? 0, mine: await myRentals(shop.id, session.user.id) });
  } catch (err) {
    return serverError(err);
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rent"), itemId: z.string().min(1).max(40), days: z.number().int(), useTickets: z.boolean().optional() }),
  z.object({ action: z.literal("extend"), rentalId: z.string().min(1).max(40), days: z.number().int() }),
  z.object({ action: z.literal("return"), rentalId: z.string().min(1).max(40) }),
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
  if (!parsed.success) return badRequest("입력을 확인해 주세요.");
  const d = parsed.data;
  try {
    if (d.action === "rent") {
      const r = await rentItem(shop.id, { id: session.user.id, name: session.user.name || "회원", discordId: session.user.discordId ?? null }, d.itemId, d.days, d.useTickets !== false);
      try {
        const { refreshRentalPanel } = await import("@/lib/discord/rental");
        await refreshRentalPanel(shop.id);
      } catch {
        /* 디스코드 미연동 */
      }
      if (session.user.discordId) {
        const { sendDiscordDm } = await import("@/lib/discord/dm");
        const { credText } = await import("@/lib/rental");
        await sendDiscordDm(
          session.user.discordId,
          { content: `**[DOES 렌탈] ${r.rental.itemTitle} 대여 시작**\n<t:${Math.floor(Date.parse(r.rental.until) / 1000)}:f>까지\n\`\`\`\n${credText(r.cred)}\n\`\`\`\n비밀번호 · 이메일 · 보안 설정은 바꾸지 마세요.` },
          shop.id,
        ).catch(() => null);
      }
      return NextResponse.json({ ok: true, rental: { ...r.rental, card: undefined }, cred: r.cred, quote: r.quote });
    }
    if (d.action === "extend") {
      const r = await extendRental(shop.id, session.user.id, d.rentalId, d.days);
      return NextResponse.json({ ok: true, until: r.rental.until, fee: r.fee });
    }
    await returnEarly(shop.id, session.user.id, d.rentalId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError(err);
  }
}
