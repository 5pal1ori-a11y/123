import { NextResponse } from "next/server";
import {
  badRequest,
  isShop,
  requireShop,
  unauthorized,
  assertSameOrigin,
} from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import {
  createDiscordLinkCode,
  initStore,
  persistAsync,
  unlinkDiscord,
} from "@/lib/store";
import { verifyLinkCodeInKv } from "@/lib/db-persist";

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();
  const user = session.user;

  return NextResponse.json({
    linked: Boolean(user.discordId),
    discordId: user.discordId,
    discordUsername: user.discordUsername,
  });
}

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return unauthorized();

  const json = (await request.json().catch(() => null)) as { action?: string } | null;
  if (json?.action === "unlink") {
    const result = unlinkDiscord(shop.id, session.user.id);
    if (!result.ok) return badRequest(result.error);
    await persistAsync();
    return NextResponse.json({ ok: true });
  }

  let result = createDiscordLinkCode(shop.id, session.user.id);
  if (!result.ok) return badRequest(result.error);
  await persistAsync();

  let saved = await verifyLinkCodeInKv(shop.id, result.code);
  if (!saved) {
    // Racing KV write may have wiped the code — issue once more and persist
    result = createDiscordLinkCode(shop.id, session.user.id);
    if (!result.ok) return badRequest(result.error);
    await persistAsync();
    saved = await verifyLinkCodeInKv(shop.id, result.code);
  }

  if (!saved) {
    return badRequest("코드 저장에 실패했어요. 잠시 후 다시 발급해 주세요.");
  }

  return NextResponse.json({
    ok: true,
    code: result.code,
    expiresAt: result.expiresAt,
    hint: "Discord에서 /연동 후 코드만 붙여넣으세요.",
  });
}
