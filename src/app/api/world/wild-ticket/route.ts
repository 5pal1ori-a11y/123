import { NextResponse } from "next/server";
import { isShop, requireShop, serverError } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { worldDisplayName } from "@/lib/world/server";
import { signWorldTicket } from "@/lib/world/ticket-core";

export const dynamic = "force-dynamic";

const GUEST_ID = /^[a-z0-9]{16,40}$/;

async function authSecret() {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const v = (env as { AUTH_SECRET?: string }).AUTH_SECRET?.trim();
    if (v) return v;
  } catch {
    /* local */
  }
  return process.env.AUTH_SECRET?.trim() || "";
}

function guestName(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
  return `손님${String(h % 10000).padStart(4, "0")}`;
}

/**
 * 야생 멀티플레이 입장권. 로그인했으면 광장과 같은 입장권,
 * 게스트면 야생 전용 키로 서명한 입장권 (광장 방은 이 키를 모르므로 게스트가 광장엔 못 들어간다).
 */
export async function POST(request: Request) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    const secret = await authSecret();
    if (!secret) return NextResponse.json({ error: "멀티플레이 설정이 아직 없어요" }, { status: 503 });
    const session = await getUserSession(shop.slug, request);
    const exp = Date.now() + 5 * 60_000;
    let ticket: string;
    if (session) {
      ticket = await signWorldTicket(
        { u: session.user.id, n: worldDisplayName(session.user), s: shop.slug, e: exp, k: session.user.minecraftUuid ?? null },
        secret,
      );
    } else {
      const body = (await request.json().catch(() => ({}))) as { guest?: unknown };
      const gid = typeof body.guest === "string" ? body.guest.toLowerCase() : "";
      if (!GUEST_ID.test(gid)) return NextResponse.json({ error: "게스트 정보가 올바르지 않아요" }, { status: 400 });
      ticket = await signWorldTicket({ u: `guest:${gid}`, n: guestName(gid), s: shop.slug, e: exp, k: null }, `${secret}:wild-guest`);
    }
    return NextResponse.json({ ticket, room: shop.slug }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return serverError(err);
  }
}
