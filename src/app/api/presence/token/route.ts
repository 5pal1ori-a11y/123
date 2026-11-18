import { NextResponse } from "next/server";
import { isShop, requireShop } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { presenceRoomName, signPresenceToken } from "@/lib/presence-token";

export const dynamic = "force-dynamic";

/** 로그인한 회원에게만 접속 표시용 서명 토큰을 준다 (게스트는 token: null) */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return NextResponse.json({ token: null }, { headers: { "Cache-Control": "no-store" } });
  try {
    const token = signPresenceToken(presenceRoomName(shop.slug), session.user.id);
    return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ token: null }, { headers: { "Cache-Control": "no-store" } });
  }
}
