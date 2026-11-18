import { NextResponse } from "next/server";
import { isShop, requireShop } from "@/lib/api";
import { refreshMfaStockIfStale } from "@/lib/mfa";
import { initStore, listProducts } from "@/lib/store";
import { getProductSalesCounts, getProductStockMap, getShopListingSummary } from "@/lib/store-ext";
import { resolveStockStatus } from "@/lib/types";

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  await refreshMfaStockIfStale(shop.id);

  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids");
  if (idsParam) {
    const ids = idsParam.split(",").filter(Boolean);
    const counts = getProductStockMap(shop.id, ids);
    const stock = Object.fromEntries(
      Object.entries(counts).map(([id, count]) => [id, { count, status: resolveStockStatus(count) }]),
    );
    return NextResponse.json({ stock });
  }

  const sales = getProductSalesCounts(shop.id);
  const products = listProducts(shop.id).map((p) => ({
    id: p.id,
    count: p.availableCount,
    status: p.stockStatus,
    sales: sales.get(p.id) ?? 0,
  }));
  return NextResponse.json({ products, summary: getShopListingSummary(shop.id) });
}
