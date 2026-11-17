import { NextResponse } from "next/server";
import { assertSameOrigin, isShop, isShopAdmin, requireShop, serverError, unauthorized } from "@/lib/api";
import { getStoreForRead, initStore } from "@/lib/store";
import { getChecklockDb, runChecklock } from "@/lib/checklock";

export const dynamic = "force-dynamic";

/** 체크락 상태 목록 */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  const db = await getChecklockDb(shop.id);
  const products = getStoreForRead().products.filter((p) => p.shopId === shop.id && p.productKind === "mc_account");
  const rows = products.map((p) => {
    const e = db.entries[p.id];
    return {
      productId: p.id,
      name: p.name,
      active: p.active,
      lastAt: e?.lastAt ?? null,
      issue: e?.issue ?? null,
      stopped: Boolean(e?.stopped),
      strikes: e?.strikes ?? 0,
    };
  });
  return NextResponse.json({ lastRun: db.lastRun, rows }, { headers: { "cache-control": "no-store" } });
}

/** 지금 점검 */
export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  try {
    return NextResponse.json(await runChecklock(shop.id, true));
  } catch (err) {
    return serverError(err);
  }
}
