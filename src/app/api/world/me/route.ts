import { NextResponse } from "next/server";
import { isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { publicRecipes, worldDisplayName, worldState } from "@/lib/world/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    const session = await getUserSession(shop.slug, request);
    if (!session) return unauthorized();
    const user = session.user;
    return NextResponse.json(
      {
        user: { id: user.id, name: worldDisplayName(user), discordId: user.discordId, points: user.points },
        ...(await worldState(shop.id, user)),
        recipes: publicRecipes(shop.id),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return serverError(err);
  }
}
