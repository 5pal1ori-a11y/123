import { NextResponse } from "next/server";
import { isShop, isShopAdmin, requireShop, serverError } from "@/lib/api";
import { getReviewFeed } from "@/lib/review-feed";
import { initStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    const url = new URL(request.url);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? "200") || 200));
    const fresh = url.searchParams.get("fresh") === "1" && isShopAdmin(request, shop);
    const feed = await getReviewFeed(shop.id, { fresh });
    return NextResponse.json(
      { ...feed, items: feed.items.slice(0, limit) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return serverError(err);
  }
}
