import { NextResponse } from "next/server";
import { activityUser } from "@/lib/discord-activity";
import { listProducts, userPremiumPlan } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 액티비티 홈 — 내 정보 · 판매 중 상품 · 최근 주문 */
export async function GET(request: Request) {
  const me = await activityUser(request);
  if (!me) return NextResponse.json({ error: "다시 로그인해 주세요." }, { status: 401 });
  const { shop, user } = me;
  const [{ getStoreForRead }, season, vip] = await Promise.all([
    import("@/lib/store"),
    import("@/lib/season-pass").then((m) => m.passState(shop.id, user.id)).catch(() => null),
    import("@/lib/vip").then((m) => m.vipStatus(shop.id, user.id)).catch(() => null),
  ]);
  const all = listProducts(shop.id).filter((p) => p.active);
  const names = new Map(all.map((p) => [p.id, p.name]));
  const products = all
    .filter((p) => p.availableCount > 0)
    .map((p) => {
      const discount = Math.max(0, Math.min(90, p.discountPercent ?? 0));
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        category: p.category || "기타",
        price: Math.round(p.price * (1 - discount / 100)),
        originalPrice: discount ? p.price : null,
        stock: p.availableCount,
        image: p.thumbnail ? `/api/discord-activity/img/${p.id}` : null,
        needsInput: Boolean(p.buyerInput),
        description: (p.description ?? "").slice(0, 400),
      };
    });
  const orders = getStoreForRead()
    .orders.filter((o) => o.shopId === shop.id && o.userId === user.id)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 15)
    .map((o) => ({ id: o.orderUuid, product: names.get(o.productId) ?? "상품", amount: o.amount, status: o.status, code: o.status === "dispensed" ? o.dispensedCode : null, at: o.paidAt ?? o.createdAt }));
  return NextResponse.json({
    me: { name: user.name || user.discordUsername || "회원", points: user.points, plan: userPremiumPlan(user), season: season ? { level: season.level, pass: season.pass, claimable: season.claimable } : null, vip: vip?.tier?.name ?? null },
    products,
    orders,
  });
}
