import { NextResponse } from "next/server";
import { badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { findIslandOwner, islandView, saveIslandLayout, syncIsland } from "@/lib/island/server";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { markBuild } from "@/lib/world/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    const session = await getUserSession(shop.slug, request);
    const target = new URL(request.url).searchParams.get("u");

    const owner = target ? findIslandOwner(shop.id, target) : session?.user ?? null;
    if (!owner) {
      return target
        ? NextResponse.json({ error: "섬을 찾을 수 없어요" }, { status: 404 })
        : unauthorized();
    }
    const record = await syncIsland(shop.id, owner);
    return NextResponse.json(
      { island: islandView(record, owner, session?.user.id === owner.id) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return serverError(err);
  }
}

export async function PUT(request: Request) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    const session = await getUserSession(shop.slug, request);
    if (!session) return unauthorized();
    const json = (await request.json().catch(() => null)) as { blocks?: unknown } | null;
    if (!json) return badRequest("잘못된 요청");
    const result = await saveIslandLayout(shop.id, session.user, json.blocks);
    if (!result.ok) return badRequest(result.error);
    await markBuild(shop.id, session.user.id).catch(() => {});
    return NextResponse.json({ island: islandView(result.record, session.user, true) });
  } catch (err) {
    return serverError(err);
  }
}
