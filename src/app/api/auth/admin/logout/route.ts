import { NextResponse } from "next/server";
import { isShop, requireShop, assertSameOrigin } from "@/lib/api";
import { clearSessionCookie, getAdminSession } from "@/lib/session-server";
import { initStore, persistAsync } from "@/lib/store";
import { revokeAuthSession } from "@/lib/store-ext";

export async function POST(request: Request) {
  await initStore();
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getAdminSession(shop.slug);
  if (session?.sessionId) {
    revokeAuthSession(session.sessionId, shop.id, session.adminId);
    await persistAsync();
  }
  await clearSessionCookie(shop.slug, "admin");
  return NextResponse.json({ ok: true });
}
