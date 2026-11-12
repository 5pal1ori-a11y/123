import { NextResponse } from "next/server";
import { isShop, requireShop } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore, listPurchaseLeaderboard } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const periodRaw = new URL(request.url).searchParams.get("period") || "month";
  const period = periodRaw === "week" || periodRaw === "year" ? periodRaw : "month";
  const ranked = listPurchaseLeaderboard(shop.id, period);
  const rows = ranked.map((row, index) => ({
    rank: index + 1,
    name: row.name,
    amount: row.amount,
    count: row.count,
  }));
  const session = await getUserSession(shop.slug, request);
  const mineIndex = session ? ranked.findIndex((row) => row.userId === session.user.id) : -1;
  const mine =
    mineIndex >= 0
      ? {
          rank: mineIndex + 1,
          name: ranked[mineIndex]!.name,
          amount: ranked[mineIndex]!.amount,
          count: ranked[mineIndex]!.count,
        }
      : null;
  return NextResponse.json({ period, rows, mine, total: ranked.length });
}
