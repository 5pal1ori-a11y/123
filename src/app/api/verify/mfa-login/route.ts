import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-meta";
import { initStore } from "@/lib/store";
import { initStoreKvOnly } from "@/lib/store-init";
import { isMfaVerifyHost } from "@/lib/domain";
import { findShopBySlug, getDiscordCredentials, MFA_SHOP_SLUG } from "@/lib/store";
import { listBotGuilds } from "@/lib/discord/list-bot-guilds";
import {
  assertMfaShopAdmin,
  botInviteUrl,
  ensureMfaVerifyGuild,
  listMfaVerifyGuilds,
  mfaVerifyGuildIdFromEnv,
} from "@/lib/verify-bot/mfa";
import { verifyDiscordEnvAsync } from "@/lib/verify-bot/env";
import { registerVerifyGuildCommands } from "@/lib/verify-bot/rest";
import { initVerifyStore } from "@/lib/verify-bot/store";
import {
  createVerifyAdminToken,
  verifyAdminCookieName,
  verifyAdminCookieOptions,
} from "@/lib/verify-bot/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  guildId: z.string().regex(/^\d{5,30}$/).optional(),
  guildName: z.string().max(100).optional(),
});

function hostOk(request: Request) {
  return isMfaVerifyHost(new URL(request.url).host);
}

export async function POST(request: Request) {
  if (!hostOk(request)) {
    return NextResponse.json({ error: "doesmc 인증 패널에서만 사용할 수 있어요." }, { status: 404 });
  }
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    await initStore();
  } catch {
    await initStoreKvOnly();
  }
  await initVerifyStore();

  const ip = clientIp(request);
  const rl = rateLimit(`mfa-verify-login:${ip}`, 12, 15 * 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "아이디와 비밀번호를 입력하세요." }, { status: 400 });
  }

  const admin = assertMfaShopAdmin(parsed.data.username, parsed.data.password);
  if (!admin) {
    return NextResponse.json({ error: "로그인 정보가 올바르지 않습니다." }, { status: 401 });
  }

  const inviteUrl = await botInviteUrl();
  const verifyEnv = await verifyDiscordEnvAsync();
  const shop = findShopBySlug(MFA_SHOP_SLUG);
  const shopCreds = shop ? getDiscordCredentials(shop.id) : { botToken: "" };
  const verifyGuilds = await listBotGuilds(verifyEnv.botToken);
  const guilds = verifyGuilds.length ? verifyGuilds : await listBotGuilds(shopCreds.botToken);

  const locked = mfaVerifyGuildIdFromEnv();
  let guildId = parsed.data.guildId || locked;
  if (!guildId) {
    const existing = listMfaVerifyGuilds();
    if (existing.length === 1) guildId = existing[0].guildId;
  }

  if (!guildId) {
    return NextResponse.json({
      ok: true,
      needsGuild: true,
      inviteUrl,
      guilds,
    });
  }

  const guild = await ensureMfaVerifyGuild(guildId, parsed.data.guildName);
  await registerVerifyGuildCommands(guild.guildId);
  const response = NextResponse.json({
    ok: true,
    needsGuild: false,
    guildId: guild.guildId,
    guildName: guild.guildName,
    inviteUrl,
    guilds,
  });
  response.cookies.set(
    verifyAdminCookieName(),
    createVerifyAdminToken(guild.guildId),
    verifyAdminCookieOptions(),
  );
  return response;
}
