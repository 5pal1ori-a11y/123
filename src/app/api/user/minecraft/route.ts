import { NextResponse } from "next/server";
import { badRequest, isShop, requireShop, serverError, unauthorized } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { getUserSession } from "@/lib/session-server";
import { initStore, persistAsync, setManualMinecraftName, toPublicUser } from "@/lib/store";
import { isValidIgn, resolveIgn } from "@/lib/world/minecraft";

export const dynamic = "force-dynamic";

/** 자바 닉네임을 직접 등록해 월드에서 그 스킨을 쓴다. name 이 빈 문자열이면 등록을 지운다 */
export async function POST(request: Request) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    const session = await getUserSession(shop.slug, request);
    if (!session) return unauthorized();
    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
    const raw = typeof body?.name === "string" ? body.name.trim() : null;
    if (raw === null) return badRequest("닉네임을 입력해 주세요.");

    let profile: { uuid: string; name: string } | null = null;
    if (raw) {
      if (!isValidIgn(raw)) return badRequest("마인크래프트 닉네임은 영문 · 숫자 · _ 3~16자예요.");
      profile = await resolveIgn(raw);
      if (!profile) return NextResponse.json({ error: "그런 자바 에디션 닉네임을 찾지 못했어요." }, { status: 404 });
    }
    const result = setManualMinecraftName(session.user.id, profile);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    await persistAsync();
    return NextResponse.json({ user: toPublicUser(result.user) });
  } catch (err) {
    return serverError(err);
  }
}
