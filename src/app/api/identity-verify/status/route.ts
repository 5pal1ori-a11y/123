import { NextResponse } from "next/server";
import { isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { getIdentityRecord, identityVerifyRequired, tossIdentityConfig } from "@/lib/identity-verify";

/** 현재 로그인한 손님의 본인인증 상태 + (필요하면) 토스 위젯용 clientKey */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();

  try {
    const required = await identityVerifyRequired(shop.id);
    const rec = await getIdentityRecord(shop.id, session.user.id);
    const verified = Boolean(rec);
    const cfg = await tossIdentityConfig();
    return NextResponse.json({
      required,
      verified,
      configured: cfg.configured,
      // 위젯 로드에 쓰는 공개 키 — 인증이 필요하고 아직 안 됐을 때만 내려준다
      clientKey: required && !verified ? cfg.clientKey : null,
      name: rec?.name ?? null,
      verifiedAt: rec?.verifiedAt ?? null,
    });
  } catch (err) {
    return serverError(err);
  }
}
