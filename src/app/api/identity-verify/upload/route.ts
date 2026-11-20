import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { submitUploadVerification } from "@/lib/identity-verify";

const schema = z.object({
  // 순수 base64 (data URL 접두어 제외)
  imageBase64: z.string().min(1).max(7_000_000),
  imageType: z.string().min(3).max(40),
  realName: z.string().max(40).optional(),
});

/** 손님이 신분증 사진을 올린다 → 검토 대기(pending) */
export async function POST(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();

  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badRequest("사진을 다시 올려 주세요.");

    const rec = await submitUploadVerification(shop.id, session.user.id, {
      imageBase64: parsed.data.imageBase64,
      imageType: parsed.data.imageType,
      realName: parsed.data.realName,
    });

    // 관리자에게 알림 (있으면)
    try {
      const { notifyAdminIdentityPending } = await import("@/lib/identity-verify-notify");
      await notifyAdminIdentityPending(shop.id, shop.slug, session.user, rec).catch(() => {});
    } catch {
      /* 알림 모듈 없으면 무시 */
    }

    return NextResponse.json({ ok: true, status: rec.status });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError(err);
  }
}
