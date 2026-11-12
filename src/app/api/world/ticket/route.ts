import { NextResponse } from "next/server";
import { isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { worldDisplayName } from "@/lib/world/server";
import { signWorldTicket } from "@/lib/world/ticket-core";

export const dynamic = "force-dynamic";

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

export async function POST(request: Request) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    const session = await getUserSession(shop.slug, request);
    if (!session) return unauthorized();
    const secret = await authSecret();
    if (!secret) return NextResponse.json({ error: "멀티플레이 설정이 아직 없어요" }, { status: 503 });
    const ticket = await signWorldTicket(
      {
        u: session.user.id,
        n: worldDisplayName(session.user),
        s: shop.slug,
        e: Date.now() + 5 * 60_000,
        k: session.user.minecraftUuid ?? null,
      },
      secret,
    );
    return NextResponse.json({ ticket, room: shop.slug }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return serverError(err);
  }
}
