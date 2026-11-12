import { NextResponse } from "next/server";
import { badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { mineFinish, mineStart, mineStatus } from "@/lib/world/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    const session = await getUserSession(shop.slug, request);
    return NextResponse.json({ ...(await mineStatus(shop.id, session?.user.id ?? null)), signedIn: Boolean(session) });
  } catch (err) {
    return serverError(err);
  }
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
    const body = (await request.json().catch(() => null)) as { action?: string; cells?: unknown } | null;
    if (body?.action === "start") return NextResponse.json(await mineStart(shop.id, session.user.id));
    if (body?.action === "finish") {
      const result = await mineFinish(shop.id, session.user, body.cells);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
      return NextResponse.json(result);
    }
    return badRequest("잘못된 요청");
  } catch (err) {
    return serverError(err);
  }
}
