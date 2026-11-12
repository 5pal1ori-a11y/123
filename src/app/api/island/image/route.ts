import { NextResponse } from "next/server";
import { isShop, requireShop, serverError } from "@/lib/api";
import { renderIslandPng } from "@/lib/island/png";
import { findIslandOwner, syncIsland } from "@/lib/island/server";
import { STARTER_BLOCKS } from "@/lib/island/world";
import { initStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type EdgeCache = { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> };

function edgeCache(): EdgeCache | null {
  const c = (globalThis as { caches?: { default?: EdgeCache } }).caches;
  return c?.default ?? null;
}

export async function GET(request: Request) {
  try {
    const cache = edgeCache();
    const cacheKey = new Request(request.url, { method: "GET" });
    const hit = await cache?.match(cacheKey);
    if (hit) return hit;

    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    const target = new URL(request.url).searchParams.get("u");

    let blocks = STARTER_BLOCKS;
    if (target) {
      const owner = findIslandOwner(shop.id, target);
      if (!owner) return NextResponse.json({ error: "섬을 찾을 수 없어요" }, { status: 404 });
      blocks = (await syncIsland(shop.id, owner)).blocks;
    }

    const png = await renderIslandPng(blocks);
    const res = new Response(png, {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=300, s-maxage=600",
      },
    });
    if (cache) await cache.put(cacheKey, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    return serverError(err);
  }
}
