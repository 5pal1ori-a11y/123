import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { evaluateShopVisitorAccess } from "@/lib/access-guard";
import { DISCORD_LINK_REQUIRED, isMfaShopSlug } from "@/lib/discord/does-env";
import { getUserSession } from "@/lib/session-server";
import { purchaseCartWithPointsSmart, purchaseWithPointsSmart } from "@/lib/mfa";
import { getProductById, getShopSettings, initStore, persistAsync, setOrderBuyerInput } from "@/lib/store";
import { checkBuyerInput } from "@/lib/buyer-input";
import type { Order } from "@/lib/types";

/** 손님이 넣은 정보를 주문에 붙이고, 디스코드 관리자 로그에 남긴다 */
async function attachInputs(shopId: string, orders: Order[], values: Map<string, { label: string; value: string }>) {
  if (!values.size) return;
  const lines: string[] = [];
  for (const [productId, input] of values) {
    const ids = orders.filter((o) => o.productId === productId).map((o) => o.id);
    if (!ids.length) continue;
    setOrderBuyerInput(shopId, ids, input);
    for (const o of orders) if (o.productId === productId) o.buyerInput = input;
    lines.push(`**${getProductById(productId)?.name ?? "상품"}** · 주문 ${ids.length}건\n${input.label}: ${input.value}`);
  }
  if (lines.length) {
    const { postAdminLog } = await import("@/lib/discord/logs");
    postAdminLog(shopId, { title: "구매 요청 정보", lines });
  }
}

const TERMS_REQUIRED = "이용약관과 개인정보처리방침에 동의해 주세요.";

const schema = z.union([
  z.object({ productId: z.string().min(1) }),
  z.object({
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().int().min(1).max(99),
        }),
      )
      .min(1)
      .max(30),
  }),
]);

export async function POST(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();
  if (isMfaShopSlug(shop.slug) && !session.user.discordId) {
    return NextResponse.json({ error: DISCORD_LINK_REQUIRED, code: "discord_link_required" }, { status: 403 });
  }

  const settings = getShopSettings(shop.id);
  const access = await evaluateShopVisitorAccess(request, settings);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }

  try {
    const json = await request.json();
    if ((json as { agreeTerms?: unknown })?.agreeTerms !== true) {
      return NextResponse.json({ error: TERMS_REQUIRED, code: "terms_required" }, { status: 400 });
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) return badRequest("상품을 선택하세요.");

    // 서버 초대 링크 · 이메일 등 구매할 때 받아야 하는 정보 확인
    const rawInputs = ((json as { buyerInputs?: Record<string, unknown> }).buyerInputs ?? {}) as Record<string, unknown>;
    const productIds = "items" in parsed.data ? parsed.data.items.map((i) => i.productId) : [parsed.data.productId];
    const inputValues = new Map<string, { label: string; value: string }>();
    for (const pid of new Set(productIds)) {
      const product = getProductById(pid);
      if (!product?.buyerInput) continue;
      const checked = checkBuyerInput(product, rawInputs[pid]);
      if (!checked.ok) return NextResponse.json({ error: checked.error, code: "buyer_input_required" }, { status: 400 });
      if (checked.value) inputValues.set(pid, { label: product.buyerInput.label, value: checked.value });
    }

    if ("items" in parsed.data) {
      const result = await purchaseCartWithPointsSmart(shop.id, session.user.id, parsed.data.items);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
      await attachInputs(shop.id, result.orders, inputValues);
      await persistAsync();
      return NextResponse.json({
        orders: result.orders,
        total: result.total,
        order: result.orders[0] ?? null,
        ...(result.partialError ? { partialError: result.partialError } : {}),
      });
    }

    const result = await purchaseWithPointsSmart(shop.id, session.user.id, parsed.data.productId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    await attachInputs(shop.id, [result.order], inputValues);
    await persistAsync();
    return NextResponse.json({ order: result.order, orders: [result.order] });
  } catch (err) {
    return serverError(err);
  }
}
