import { NextResponse } from "next/server";
import { isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { getIdentityRecord, identityVerifyRequired } from "@/lib/identity-verify";

/** 현재 로그인한 손님의 본인인증 상태 */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();

  try {
    const required = await identityVerifyRequired(shop.id);
    const rec = await getIdentityRecord(shop.id, session.user.id);
    return NextResponse.json({
      required,
      status: rec?.status ?? null, // null | pending | approved | rejected
      verified: rec?.status === "approved",
      rejectReason: rec?.status === "rejected" ? rec.rejectReason : null,
      submittedAt: rec?.submittedAt ?? null,
    });
  } catch (err) {
    return serverError(err);
  }
}
