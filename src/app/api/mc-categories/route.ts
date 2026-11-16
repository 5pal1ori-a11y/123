import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, isShop, isShopAdmin, requireShop, serverError, unauthorized } from "@/lib/api";
import { initStore } from "@/lib/store";
import { getMcCategories, setMcCategories } from "@/lib/mc-categories";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  return NextResponse.json({ categories: await getMcCategories(shop.id) }, { headers: { "cache-control": "no-store" } });
}

const schema = z.object({ categories: z.array(z.string().max(40)).min(1).max(30) });

export async function PUT(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return badRequest("카테고리 목록이 올바르지 않아요.");
    return NextResponse.json({ ok: true, categories: await setMcCategories(shop.id, parsed.data.categories) });
  } catch (e) {
    return serverError(e);
  }
}
