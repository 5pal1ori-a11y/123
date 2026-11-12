import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, forbidden, isShop, isShopOwnerAdmin, requireShop, serverError } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { getProductById, initStore, listProducts, persistAsync, updateShopSettings } from "@/lib/store";
import type { WorldAccount, WorldSettings } from "@/lib/types";
import { hypixelConfigured, isValidIgn, resolveIgn } from "@/lib/world/minecraft";
import { getWorldSettings } from "@/lib/world/server";

export const dynamic = "force-dynamic";

const mission = z.object({ enabled: z.boolean(), tokens: z.number().int().min(0).max(1000) });

const schema = z.object({
  parkourCoupon: z.object({
    enabled: z.boolean(),
    amount: z.number().int().min(0).max(1_000_000),
    minutes: z.number().int().min(1).max(1440),
  }),
  missions: z.object({
    attend: mission,
    parkour: mission,
    build: mission,
    review: mission,
    purchase: mission,
    end_visit: mission,
  }),
  recipes: z
    .array(z.object({ id: z.string().max(60).optional(), productId: z.string().min(1), tokens: z.number().int().min(1).max(100_000) }))
    .max(54),
  accounts: z
    .array(
      z.object({
        id: z.string().max(60).optional(),
        ign: z.string().trim().min(3).max(16),
        productId: z.string().nullable().optional(),
        note: z.string().max(80).optional(),
      }),
    )
    .max(40),
});

async function payload(shopId: string) {
  return {
    world: getWorldSettings(shopId),
    hypixel: await hypixelConfigured(),
    products: listProducts(shopId)
      .filter((p) => p.active)
      .map((p) => ({ id: p.id, name: p.name, price: p.price, thumbnail: p.thumbnail })),
  };
}

export async function GET(request: Request) {
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    if (!isShopOwnerAdmin(request, shop)) return forbidden("상점 소유자만 가능합니다.");
    return NextResponse.json(await payload(shop.id), { headers: { "cache-control": "no-store" } });
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
    if (!isShopOwnerAdmin(request, shop)) return forbidden("상점 소유자만 가능합니다.");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badRequest("월드 설정값을 확인하세요.");
    const input = parsed.data;

    const validProduct = (id: string | null | undefined) => {
      if (!id) return null;
      const p = getProductById(id);
      return p && p.shopId === shop.id ? p.id : null;
    };

    const recipes = input.recipes
      .filter((r) => validProduct(r.productId))
      .map((r) => ({ id: r.id || randomUUID().slice(0, 8), productId: r.productId, tokens: r.tokens }));

    const prev = new Map(getWorldSettings(shop.id).accounts.map((a) => [a.id, a]));
    const accounts: WorldAccount[] = [];
    for (const a of input.accounts) {
      if (!isValidIgn(a.ign)) return badRequest(`마크 닉네임 형식이 아니에요: ${a.ign}`);
      const old = a.id ? prev.get(a.id) : undefined;
      let uuid = old && old.ign.toLowerCase() === a.ign.toLowerCase() ? old.uuid : null;
      let ign = a.ign;
      if (!uuid) {
        const found = await resolveIgn(a.ign).catch(() => null);
        if (!found) return badRequest(`정품 마크 계정을 찾을 수 없어요: ${a.ign}`);
        uuid = found.uuid;
        ign = found.name;
      }
      accounts.push({
        id: old?.id ?? randomUUID().slice(0, 8),
        ign,
        uuid,
        productId: validProduct(a.productId),
        note: (a.note ?? "").trim(),
        createdAt: old?.createdAt ?? new Date().toISOString(),
      });
    }

    const world: WorldSettings = { parkourCoupon: input.parkourCoupon, missions: input.missions, recipes, accounts };
    updateShopSettings(shop.id, { world });
    await persistAsync();
    return NextResponse.json(await payload(shop.id));
  } catch (err) {
    return serverError(err);
  }
}
