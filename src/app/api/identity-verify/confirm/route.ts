import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { initStore } from "@/lib/store";
import { confirmTossIdentity, findDuplicateByCi } from "@/lib/identity-verify";

const schema = z.object({
  verificationId: z.string().min(1).max(100),
});

/** 손님이 토스 팝업에서 인증을 마친 뒤, 받은 verificationId 로 서버가 결과를 확정·저장한다 */
export async function POST(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();

  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badRequest("요청 형식이 올바르지 않아요.");

    const rec = await confirmTossIdentity(shop.id, session.user.id, parsed.data.verificationId);

    // 같은 사람(CI)이 다른 계정으로 이미 인증했는지 — 중복가입 경고 (막지는 않고 알림만)
    let duplicate = false;
    if (rec.ciHash) {
      const dup = await findDuplicateByCi(shop.id, rec.ciHash, session.user.id);
      duplicate = Boolean(dup);
    }

    return NextResponse.json({ verified: true, name: rec.name, duplicate });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError(err);
  }
}
