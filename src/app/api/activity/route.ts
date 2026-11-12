import { NextResponse } from "next/server";
import { isShop, requireShop, serverError } from "@/lib/api";
import { listPublicActivity } from "@/lib/activity";
import { initStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Public shop activity — sanitized, no secrets / full emails */
export async function GET(request: Request) {
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;

    const limitRaw = Number(new URL(request.url).searchParams.get("limit") ?? "24");
    const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 24;

    return NextResponse.json({
      activities: listPublicActivity(shop.id, limit),
    });
  } catch (err) {
    return serverError(err);
  }
}
