import { NextResponse } from "next/server";
import { forbidUnlessStaffCan, isShop, isShopAdmin, requireShop, unauthorized } from "@/lib/api";
import { sanitizeOrder } from "@/lib/security";
import { confirmPayment, initStore, persistAsync } from "@/lib/store";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  const denied = forbidUnlessStaffCan(request, shop, "orders");
  if (denied) return denied;

  const { id } = await context.params;
  const result = confirmPayment(id, shop.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  await persistAsync();
  return NextResponse.json({ order: sanitizeOrder(result.order, { includeCode: true }) });
}
