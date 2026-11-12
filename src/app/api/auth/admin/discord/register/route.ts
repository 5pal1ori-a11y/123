import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createShopAdminClaimTicket,
  PANEL_OAUTH_COOKIE,
  panelOAuthCookieOptions,
  readPanelOAuthSessionFromRequest,
} from "@/lib/discord/panel-oauth";
import { getRootDomain, shopUrl } from "@/lib/domain";
import { createSessionToken, sessionCookieName } from "@/lib/auth";
import { sessionCookieBaseOptions } from "@/lib/session-cookie";
import { clientIp, clientUserAgent } from "@/lib/request-meta";
import {
  activateFreeShop,
  activateShop,
  findShopLinkedToDiscordGuild,
  initStore,
  persistAsync,
  updateShopSettings,
} from "@/lib/store";
import {
  moderateShopName,
  moderationUserMessage,
} from "@/lib/content-moderation";
import { createAuthSession, recordLoginHistory } from "@/lib/store-ext";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isFreeLicenseKey(key: string) {
  const trimmed = key.trim();
  return !trimmed || trimmed.toUpperCase() === "FREE";
}

const schema = z.object({
  guildId: z.string().min(5),
  licenseKey: z.string().optional(),
  slug: z.string().min(2),
  name: z.string().min(1),
  ownerEmail: z.string().email(),
  adminPassword: z.string().min(8),
  tagline: z.string().optional(),
});

export async function POST(request: Request) {
  await initStore({ force: true });
  const session = readPanelOAuthSessionFromRequest(request, "shop");
  if (!session) {
    return NextResponse.json({ error: "Discord 로그인이 필요합니다." }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력값을 확인해주세요. 관리자 비밀번호는 8자 이상이어야 해요." },
      { status: 400 },
    );
  }

  const guildId = parsed.data.guildId.trim();
  const guild = session.ownedGuilds.find((g) => g.id === guildId);
  if (!guild || guild.owner !== true) {
    return NextResponse.json(
      { error: "Discord 서버 소유자 계정으로만 상점을 개설할 수 있어요." },
      { status: 403 },
    );
  }

  if (findShopLinkedToDiscordGuild(guildId)) {
    return NextResponse.json(
      { error: "이미 이 Discord 서버에 연동된 상점이 있어요." },
      { status: 409 },
    );
  }

  const licenseKey = parsed.data.licenseKey?.trim() ?? "";

  const mod = await moderateShopName(parsed.data.name);
  if (mod.action === "block") {
    return NextResponse.json(
      { error: moderationUserMessage(mod, "shop") || mod.reason },
      { status: 400 },
    );
  }
  const moderation =
    mod.action === "review"
      ? { status: "pending_review" as const, reason: mod.reason }
      : { status: "ok" as const };

  const result = isFreeLicenseKey(licenseKey)
    ? activateFreeShop({ ...parsed.data, moderation })
    : activateShop({ ...parsed.data, licenseKey, moderation });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  const { shop } = result;
  updateShopSettings(shop.id, {
    discordBotEnabled: true,
    discordGuildId: guildId,
    discordOwnerId: session.discordUserId,
    discordOwnerUsername: session.discordUsername,
  });

  const pendingReview = shop.moderationStatus === "pending_review";
  const ip = clientIp(request);
  const ua = clientUserAgent(request);
  const authSession = createAuthSession({
    shopId: shop.id,
    subjectId: `discord:${session.discordUserId}`,
    role: "admin",
    ip,
    userAgent: ua,
  });
  recordLoginHistory({
    shopId: shop.id,
    subjectId: `discord:${session.discordUserId}`,
    role: "admin",
    ip,
    userAgent: ua,
  });

  try {
    await persistAsync();
  } catch {
    /* continue — cookie + rehydrate */
  }

  const root = getRootDomain();
  const adminUrl =
    root === "localhost"
      ? `http://${shop.slug}.localhost:3000/admin`
      : `https://${shop.slug}.${root}/admin`;
  const ticket = createShopAdminClaimTicket({
    shopId: shop.id,
    shopSlug: shop.slug,
    discordUserId: session.discordUserId,
  });
  const claimUrl = `${shopUrl(shop.slug, "/api/auth/admin/discord/claim")}?t=${encodeURIComponent(ticket)}`;
  const token = createSessionToken({
    sub: `discord:${session.discordUserId}`,
    shopId: shop.id,
    role: "admin",
    sid: authSession.id,
  });

  const res = NextResponse.json({
    ok: true,
    shopSlug: shop.slug,
    adminUrl,
    claimUrl,
    moderation: pendingReview
      ? {
          pendingReview: true,
          message: moderationUserMessage(mod, "shop"),
          reason: shop.moderationReason,
        }
      : { pendingReview: false },
  });
  if (root !== "localhost") {
    res.cookies.set(sessionCookieName(shop.slug, "admin"), token, {
      ...sessionCookieBaseOptions(),
      domain: `.${root}`,
    });
  }
  res.cookies.set(PANEL_OAUTH_COOKIE, "", { ...panelOAuthCookieOptions(0), maxAge: 0 });
  return res;
}
