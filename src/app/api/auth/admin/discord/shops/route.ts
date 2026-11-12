import { NextResponse } from "next/server";
import {
  createShopAdminClaimTicket,
  readPanelOAuthSessionFromRequest,
} from "@/lib/discord/panel-oauth";
import { getRootDomain, shopUrl } from "@/lib/domain";
import { createSessionToken, sessionCookieName } from "@/lib/auth";
import { sessionCookieBaseOptions } from "@/lib/session-cookie";
import { clientIp, clientUserAgent } from "@/lib/request-meta";
import {
  findShopBySlug,
  findShopLinkedToDiscordGuild,
  getShopSettings,
  initStore,
  persistAsync,
  updateShopSettings,
} from "@/lib/store";
import { createAuthSession, recordLoginHistory } from "@/lib/store-ext";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function issueAdminRedirect(opts: {
  shop: { id: string; slug: string };
  discordUserId: string;
  request: Request;
}) {
  const root = getRootDomain();
  const ip = clientIp(opts.request);
  const ua = clientUserAgent(opts.request);
  const authSession = createAuthSession({
    shopId: opts.shop.id,
    subjectId: `discord:${opts.discordUserId}`,
    role: "admin",
    ip,
    userAgent: ua,
  });
  recordLoginHistory({
    shopId: opts.shop.id,
    subjectId: `discord:${opts.discordUserId}`,
    role: "admin",
    ip,
    userAgent: ua,
  });

  const dest =
    root === "localhost"
      ? `http://${opts.shop.slug}.localhost:3000/admin`
      : `https://${opts.shop.slug}.${root}/admin`;

  // Prefer claim hop for host-only cookie when called from shop; apex uses domain cookie.
  const ticket = createShopAdminClaimTicket({
    shopId: opts.shop.id,
    shopSlug: opts.shop.slug,
    discordUserId: opts.discordUserId,
  });
  const claimUrl = `${shopUrl(opts.shop.slug, "/api/auth/admin/discord/claim")}?t=${encodeURIComponent(ticket)}`;

  // Also return domain-cookie redirect for apex clients that skip claim.
  const token = createSessionToken({
    sub: `discord:${opts.discordUserId}`,
    shopId: opts.shop.id,
    role: "admin",
    sid: authSession.id,
  });

  return { claimUrl, dest, token, authSession };
}

export async function GET(request: Request) {
  await initStore();
  const session = readPanelOAuthSessionFromRequest(request, "shop");
  if (!session) {
    return NextResponse.json({ error: "Discord 로그인이 필요합니다.", needLogin: true }, { status: 401 });
  }

  const owned = new Set(session.ownedGuildIds);
  const registered: Array<{
    guildId: string;
    guildName: string;
    icon: string | null;
    shop: { id: string; slug: string; name: string };
  }> = [];
  const unregistered: Array<{ guildId: string; guildName: string; icon: string | null }> = [];
  const seen = new Set<string>();

  for (const g of session.ownedGuilds) {
    if (!owned.has(g.id) || seen.has(g.id)) continue;
    seen.add(g.id);
    const shop = findShopLinkedToDiscordGuild(g.id);
    if (shop) {
      registered.push({
        guildId: g.id,
        guildName: g.name,
        icon: g.icon,
        shop: { id: shop.id, slug: shop.slug, name: shop.name },
      });
    } else if (g.owner === true) {
      // 상점 개설은 Discord 서버 소유자만
      unregistered.push({ guildId: g.id, guildName: g.name, icon: g.icon });
    }
  }

  return NextResponse.json({
    ok: true,
    discordUserId: session.discordUserId,
    discordUsername: session.discordUsername,
    registered,
    unregistered,
  });
}

export async function POST(request: Request) {
  await initStore();
  const session = readPanelOAuthSessionFromRequest(request, "shop");
  if (!session) {
    return NextResponse.json({ error: "Discord 로그인이 필요합니다." }, { status: 401 });
  }

  const json = (await request.json().catch(() => null)) as {
    guildId?: string;
    shopSlug?: string;
  } | null;

  const guildId = json?.guildId?.trim() ?? "";
  const shopSlug = json?.shopSlug?.trim().toLowerCase() ?? "";
  // 서버 관리 권한(MANAGE_GUILD)만으로는 상점 소유권을 가져갈 수 없게, 실제 서버 소유자만 인정
  const owned = new Set(session.ownedGuilds.filter((g) => g.owner).map((g) => g.id));

  let shop = guildId ? findShopLinkedToDiscordGuild(guildId) : null;
  if (!shop && shopSlug) shop = findShopBySlug(shopSlug);
  if (!shop) {
    return NextResponse.json({ error: "등록된 상점을 찾을 수 없어요." }, { status: 404 });
  }

  const settings = getShopSettings(shop.id);
  const guildOk =
    Boolean(settings.discordGuildId && owned.has(settings.discordGuildId)) ||
    (guildId && owned.has(guildId) && settings.discordGuildId === guildId);
  const ownerOk = settings.discordOwnerId === session.discordUserId;

  if (!guildOk && !ownerOk) {
    return NextResponse.json(
      { error: "소유·관리 중인 Discord 서버에 연동된 상점만 열 수 있어요." },
      { status: 403 },
    );
  }

  if (guildId && owned.has(guildId)) {
    updateShopSettings(shop.id, {
      discordGuildId: guildId,
      discordOwnerId: session.discordUserId,
      discordOwnerUsername: session.discordUsername,
    });
  } else if (!settings.discordOwnerId) {
    updateShopSettings(shop.id, { discordOwnerId: session.discordUserId });
  }

  const issued = issueAdminRedirect({
    shop,
    discordUserId: session.discordUserId,
    request,
  });
  try {
    await persistAsync();
  } catch {
    /* claim/rehydrate covers lag */
  }

  const root = getRootDomain();
  const res = NextResponse.json({
    ok: true,
    claimUrl: issued.claimUrl,
    adminUrl: issued.dest,
    shopSlug: shop.slug,
  });
  // Apex Domain cookie so picker can jump straight into admin without claim hop.
  if (root !== "localhost") {
    res.cookies.set(sessionCookieName(shop.slug, "admin"), issued.token, {
      ...sessionCookieBaseOptions(),
      domain: `.${root}`,
    });
  }
  return res;
}
