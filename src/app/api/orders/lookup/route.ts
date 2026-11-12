import { NextResponse } from "next/server";
import { isShop, requireShop, unauthorized } from "@/lib/api";
import { sanitizeOrder } from "@/lib/security";
import { getUserSession } from "@/lib/session-server";
import {
  getOrderByUuid,
  getOrdersByEmail,
  getProductById,
  initStore,
  verifyOrderAccess,
} from "@/lib/store";

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email")?.trim().toLowerCase();
  const uuid = searchParams.get("uuid")?.trim();
  const token = searchParams.get("token")?.trim();

  if (uuid) {
    const order = getOrderByUuid(shop.id, uuid);
    if (!order) {
      return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
    }

    if (!verifyOrderAccess(order, token)) {
      return NextResponse.json({ error: "주문 접근 권한이 없습니다." }, { status: 403 });
    }

    if (email && order.buyerEmail !== email) {
      return NextResponse.json({ error: "이메일이 일치하지 않습니다." }, { status: 403 });
    }

    const product = getProductById(order.productId);
    return NextResponse.json({
      order: {
        ...sanitizeOrder(order, {
          includeCode: order.status === "dispensed",
        }),
        productName: product?.name,
      },
    });
  }

  if (email) {
    const session = await getUserSession(shop.slug);
    if (!session || session.user.email !== email) {
      return unauthorized();
    }
    const orders = getOrdersByEmail(shop.id, email).map((order) => {
      const product = getProductById(order.productId);
      return {
        ...sanitizeOrder(order),
        productName: product?.name,
      };
    });
    return NextResponse.json({ orders });
  }

  return NextResponse.json({ error: "email 또는 uuid가 필요합니다." }, { status: 400 });
}
