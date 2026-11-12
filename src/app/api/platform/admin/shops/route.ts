import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, serverError, unauthorized } from "@/lib/api";
import { getPlatformAdminFromRequest } from "@/lib/session-server";
import {
  deleteShop,
  initStore,
  persistAsync,
  reviewShopModeration,
} from "@/lib/store";

const deleteSchema = z.object({
  shopId: z.string().min(1),
});

const reviewSchema = z.object({
  shopId: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional(),
});

export async function DELETE(request: Request) {
  try {
    const session = getPlatformAdminFromRequest(request);
    if (!session) return unauthorized();

    await initStore();
    const json = await request.json().catch(() => null);
    const parsed = deleteSchema.safeParse(json);
    if (!parsed.success) return badRequest("상점 ID가 필요해요.");

    const result = deleteShop(parsed.data.shopId);
    if (!result.ok) return badRequest(result.error);

    await persistAsync();
    return NextResponse.json({
      ok: true,
      slug: result.slug,
      name: result.name,
    });
  } catch (err) {
    return serverError(err);
  }
}

/** 상점명 검열 승인/거절 */
export async function PATCH(request: Request) {
  try {
    const session = getPlatformAdminFromRequest(request);
    if (!session) return unauthorized();

    await initStore();
    const json = await request.json().catch(() => null);
    const parsed = reviewSchema.safeParse(json);
    if (!parsed.success) return badRequest("shopId와 decision(approve|reject)이 필요해요.");

    const result = reviewShopModeration(
      parsed.data.shopId,
      parsed.data.decision,
      parsed.data.note,
    );
    if (!result.ok) return badRequest(result.error);

    await persistAsync();
    return NextResponse.json({
      ok: true,
      shop: {
        id: result.shop.id,
        name: result.shop.name,
        status: result.shop.status,
        moderationStatus: result.shop.moderationStatus,
        moderationReason: result.shop.moderationReason,
      },
    });
  } catch (err) {
    return serverError(err);
  }
}
