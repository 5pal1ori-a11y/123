import { NextResponse } from "next/server";
import { isShop, requireShop, serverError } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore, listProducts } from "@/lib/store";
import { hypixelConfigured, hypixelStats, profileByUuid, resolveIgn } from "@/lib/world/minecraft";
import { getWorldSettings, markEndVisit } from "@/lib/world/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    const session = await getUserSession(shop.slug, request);
    if (session) await markEndVisit(shop.id, session.user.id).catch(() => {});

    const keyed = await hypixelConfigured();
    const products = new Map(listProducts(shop.id).map((p) => [p.id, p]));
    const accounts = await Promise.all(
      getWorldSettings(shop.id).accounts.slice(0, 40).map(async (a) => {
        const uuid = a.uuid ?? (await resolveIgn(a.ign).catch(() => null))?.uuid ?? null;
        const [profile, stats] = uuid
          ? await Promise.all([
              profileByUuid(uuid).catch(() => null),
              keyed ? hypixelStats(uuid).catch(() => null) : Promise.resolve(null),
            ])
          : [null, null];
        const product = a.productId ? products.get(a.productId) : undefined;
        const linked = product && product.active ? product : null;
        return {
          id: a.id,
          ign: profile?.name ?? a.ign,
          uuid,
          slim: profile?.slim ?? false,
          hasSkin: Boolean(profile?.skinUrl),
          note: a.note,
          stats,
          product: linked
            ? { id: linked.id, slug: linked.slug, name: linked.name, price: linked.price, soldOut: linked.stockStatus === "sold_out" }
            : null,
        };
      }),
    );
    return NextResponse.json({ accounts, hypixel: keyed }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return serverError(err);
  }
}
