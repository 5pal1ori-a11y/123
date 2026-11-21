import { NextResponse } from "next/server";
import { z } from "zod";
import { activityUser } from "@/lib/discord-activity";
import { purchaseWithPointsSmart } from "@/lib/mfa";
import { getProductById, persistAsync } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 액티비티에서 포인트로 구매 (웹 /api/purchase/points 와 같은 함수 · 약관 동의 필수) */
export async function POST(request: Request) {
  const me = await activityUser(request);
  if (!me) return NextResponse.json({ error: "다시 로그인해 주세요." }, { status: 401 });
  const parsed = z.object({ productId: z.string().min(1).max(80), agreeTerms: z.literal(true) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "이용약관에 동의해 주세요." }, { status: 400 });
  const product = getProductById(parsed.data.productId);
  if (!product || product.shopId !== me.shop.id || !product.active) return NextResponse.json({ error: "없는 상품이에요." }, { status: 404 });
  if (product.buyerInput) return NextResponse.json({ error: "이 상품은 구매할 때 추가 정보가 필요해서 웹에서 구매해 주세요.", code: "web_only" }, { status: 400 });
  try {
    const r = await purchaseWithPointsSmart(me.shop.id, me.user.id, product.id, { buyerDiscordId: me.user.discordId });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
    await persistAsync();
    return NextResponse.json({ ok: true, order: { id: r.order.orderUuid, status: r.order.status, code: r.order.status === "dispensed" ? r.order.dispensedCode : null, manualNotice: product.manualNotice ?? null } });
  } catch (err) {
    console.error("[activity buy]", err);
    return NextResponse.json({ error: "구매하지 못했어요. 잠시 뒤에 다시 시도해 주세요." }, { status: 500 });
  }
}
