import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, badRequest, getShopAdminActor, isShop, isShopAdmin, requireShop, serverError, unauthorized } from "@/lib/api";
import { initStore, persistAsync, getUserById } from "@/lib/store";
import { listIdentityRecords, reviewVerification } from "@/lib/identity-verify";

/** 본인인증 신청 목록 (관리자) */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  try {
    const list = await listIdentityRecords(shop.id);
    const rows = list.slice(0, 200).map((r) => {
      const u = getUserById(r.userId);
      return {
        id: r.id,
        status: r.status,
        realName: r.realName,
        userName: u?.name ?? null,
        userEmail: u?.email ?? null,
        discordId: u?.discordId ?? null,
        hasImage: Boolean(r.imageKey),
        submittedAt: r.submittedAt,
        reviewedAt: r.reviewedAt,
        rejectReason: r.rejectReason,
      };
    });
    return NextResponse.json({ records: rows });
  } catch (err) {
    return serverError(err);
  }
}

const schema = z.object({
  recordId: z.string().min(1).max(60),
  approve: z.boolean(),
  reason: z.string().max(200).optional(),
});

/** 승인 / 거절 (관리자) */
export async function POST(request: Request) {
  await initStore();
  const origin = assertSameOrigin(request);
  if (origin) return origin;
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  const actor = getShopAdminActor(request, shop);
  const actorLabel = actor?.isOwner ? "owner" : actor?.isSubAdmin ? "staff" : "admin";

  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badRequest("요청 형식이 올바르지 않아요.");
    const rec = await reviewVerification(shop.id, parsed.data.recordId, actorLabel, parsed.data.approve, parsed.data.reason);
    await persistAsync();

    // 결과 DM (디스코드 연동 시)
    try {
      const u = getUserById(rec.userId);
      if (u?.discordId) {
        const { sendDiscordDm } = await import("@/lib/discord/dm");
        const msg = parsed.data.approve
          ? "본인인증이 승인됐어요. 이제 코인대행을 이용할 수 있어요."
          : `본인인증이 반려됐어요.\n사유: ${rec.rejectReason}\n사이트에서 다시 신청해 주세요.`;
        await sendDiscordDm(u.discordId, { content: msg }, shop.id).catch(() => {});
      }
    } catch {
      /* DM 실패 무시 */
    }

    return NextResponse.json({ ok: true, status: rec.status });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError(err);
  }
}
