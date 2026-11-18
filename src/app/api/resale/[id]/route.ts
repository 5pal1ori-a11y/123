import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, isShop, isShopAdmin, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { listResaleRequests, updateResaleRequest } from "@/lib/resale";
import { approveResaleRequest, rejectResaleRequest } from "@/lib/resale-actions";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    price: z.number().int().min(0).optional(),
    /** 구매자에게 줄 계정 정보 (이메일 | 비밀번호 …). 비우면 수동 지급 상품으로 올린다 */
    deliveryCode: z.string().max(2000).optional(),
  }),
  z.object({ action: z.literal("reject"), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal("cancel") }),
]);

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const { id } = await ctx.params;
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return badRequest("요청이 올바르지 않아요.");
    const body = parsed.data;
    const current = (await listResaleRequests(shop.id)).find((r) => r.id === id);
    if (!current) return NextResponse.json({ error: "신청을 찾을 수 없어요." }, { status: 404 });

    if (body.action === "cancel") {
      const session = await getUserSession(shop.slug, request);
      if (!session || session.user.id !== current.userId) return unauthorized();
      if (current.status !== "pending") return badRequest("검토 중인 신청만 취소할 수 있어요.");
      const r = await updateResaleRequest(shop.id, id, (x) => {
        x.status = "cancelled";
        x.reviewedAt = new Date().toISOString();
      });
      return NextResponse.json({ ok: true, request: r });
    }

    if (!isShopAdmin(request, shop)) return unauthorized();
    if (current.status !== "pending") return badRequest("이미 처리된 신청이에요.");

    if (body.action === "reject") {
      const r = await rejectResaleRequest(shop.id, id, body.reason ?? "");
      return NextResponse.json({ ok: true, request: r });
    }

    // 승인 → 「대리판매」 카테고리 마크 계정 상품으로 올린다
    const { request: r, productId } = await approveResaleRequest(shop.id, id, { price: body.price, deliveryCode: body.deliveryCode });
    return NextResponse.json({ ok: true, request: r, productId });
  } catch (e) {
    return serverError(e);
  }
}
