import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, isShop, isShopAdmin, requireShop, serverError, unauthorized } from "@/lib/api";
import { sanitizeOrder } from "@/lib/security";
import { confirmTransfer, getOrderById, initStore, persistAsync } from "@/lib/store";

const schema = z.object({
  depositorName: z.string().min(1).max(64),
  accessToken: z.string().min(16).max(128),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;

  try {
    const { id } = await context.params;
    const order = getOrderById(id);
    if (!order || order.shopId !== shop.id) {
      return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
    }

    const json = await request.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) return badRequest("입금자명과 주문 토큰이 필요합니다.");

    const result = confirmTransfer(id, shop.id, parsed.data.depositorName, parsed.data.accessToken);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    await persistAsync();
    return NextResponse.json({
      order: sanitizeOrder(result.order, { includeCode: false }),
      accessToken: result.order.accessToken,
      awaitingAdmin: result.order.status === "pending",
      message: "입금 신고가 접수됐어요. 관리자 확인 후 코드가 발급됩니다.",
    });
  } catch (err) {
    return serverError(err);
  }
}
