import { NextResponse } from "next/server";
import { isShop, requireShop } from "@/lib/api";
import { clearSessionCookie, getUserSession } from "@/lib/session-server";
import { initStore, toPublicUser } from "@/lib/store";

export async function GET(request: Request) {
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    const session = await getUserSession(shop.slug, request);
    if (!session) return NextResponse.json({ user: null });
    return NextResponse.json({ user: toPublicUser(session.user) });
  } catch {
    return NextResponse.json({ user: null });
  }
}

export async function DELETE(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (session?.sessionId) {
    const { revokeAuthSession } = await import("@/lib/store-ext");
    const { persistAsync } = await import("@/lib/store");
    revokeAuthSession(session.sessionId, shop.id, session.user.id);
    await persistAsync();
  }
  await clearSessionCookie(shop.slug, "user");
  return NextResponse.json({ ok: true });
}
