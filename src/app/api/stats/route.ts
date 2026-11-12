import { NextResponse } from "next/server";
import { forbidUnlessStaffCan, isShop, isShopAdmin, requireShop, unauthorized } from "@/lib/api";
import { adminStats, initStore } from "@/lib/store";

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  const denied = forbidUnlessStaffCan(request, shop, "orders");
  if (denied) return denied;
  return NextResponse.json({ stats: adminStats(shop.id) });
}
