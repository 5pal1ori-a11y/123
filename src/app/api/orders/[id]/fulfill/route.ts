import { NextResponse } from "next/server";
import { z } from "zod";
import {
  badRequest,
  forbidUnlessStaffCan,
  isShop,
  isShopAdmin,
  requireShop,
  unauthorized,
} from "@/lib/api";
import { fulfillManualOrder, initStore, persistAsync } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  deliveryText: z.string().trim().min(1).max(2000),
});

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

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("지급 내용을 입력해 주세요.");
  const { id } = await context.params;
  const result = fulfillManualOrder(shop.id, id, parsed.data.deliveryText);
  if (!result.ok) return badRequest(result.error);
  await persistAsync();
  return NextResponse.json({ order: result.order });
}
