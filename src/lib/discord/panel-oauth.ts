import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { DISCORD_API } from "@/lib/discord/components";
import {
  exchangeDiscordOAuthCode,
  fetchDiscordOAuthUser,
  formatDiscordUsername,
  type DiscordOAuthUser,
} from "@/lib/discord/invite";
import { doesDiscordEnvAsync, isMfaShopSlug } from "@/lib/discord/does-env";
import { discordEnvAsync } from "@/lib/discord/verify";
import {
  getRootDomain,
  manageOrigin,
  MFA_SITE_ORIGIN,
  MFA_VERIFY_PANEL_ORIGIN,
  securityOrigin,
  ticketOrigin,
} from "@/lib/domain";
import { manageDiscordEnvAsync } from "@/lib/manage-bot/env";
import { securityDiscordEnvAsync } from "@/lib/security-bot/env";
import { ticketDiscordEnvAsync } from "@/lib/ticket-bot/env";
import { verifyDiscordEnvAsync } from "@/lib/verify-bot/env";

export const PANEL_OAUTH_SCOPES = "identify guilds";
export const PANEL_BOT_INVITE_SCOPES = "bot applications.commands";

/** Broad bot install perms (moderation + messaging + manage guild/channels/roles). */
export const PANEL_BOT_INVITE_PERMISSIONS = String(
  (BigInt(1) << BigInt(1)) | // KICK_MEMBERS
    (BigInt(1) << BigInt(2)) | // BAN_MEMBERS
    (BigInt(1) << BigInt(4)) | // MANAGE_CHANNELS
    (BigInt(1) << BigInt(5)) | // MANAGE_GUILD
    (BigInt(1) << BigInt(6)) | // ADD_REACTIONS
    (BigInt(1) << BigInt(10)) | // VIEW_CHANNEL
    (BigInt(1) << BigInt(11)) | // SEND_MESSAGES
    (BigInt(1) << BigInt(13)) | // MANAGE_MESSAGES
    (BigInt(1) << BigInt(14)) | // EMBED_LINKS
    (BigInt(1) << BigInt(15)) | // ATTACH_FILES
    (BigInt(1) << BigInt(16)) | // READ_MESSAGE_HISTORY
    (BigInt(1) << BigInt(27)) | // MANAGE_NICKNAMES
    (BigInt(1) << BigInt(28)) | // MANAGE_ROLES
    (BigInt(1) << BigInt(31)) | // USE_APPLICATION_COMMANDS
    (BigInt(1) << BigInt(40)), // MODERATE_MEMBERS
);

export type PanelOAuthProduct = "security" | "ticket" | "verify" | "manage" | "shop";

export type OwnedDiscordGuild = {
  id: string;
  name: string;
  icon: string | null;
  /** Discord 서버 소유자(owner) 여부 — 상점 개설은 owner만 가능 */
  owner: boolean;
};

export type PanelOAuthSession = {
  product: PanelOAuthProduct;
  discordUserId: string;
  discordUsername: string;
  ownedGuildIds: string[];
  ownedGuilds: OwnedDiscordGuild[];
  exp: number;
};

type StatePayload = {
  product: PanelOAuthProduct;
  nonce: string;
  exp: number;
  /** Optional shop slug when starting from a shop subdomain */
  shopSlug?: string;
  /** bot invite flow */
  intent?: "login" | "invite";
  guildId?: string;
};

function authSecret() {
  return process.env.AUTH_SECRET?.trim() || "vendix-dev-secret-change-me";
}

function b64url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function signBody(prefix: string, body: string) {
  return b64url(createHmac("sha256", authSecret()).update(`${prefix}:${body}`).digest());
}

function verifyBody(prefix: string, body: string, sig: string) {
  const expected = signBody(prefix, body);
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function createPanelOAuthState(
  product: PanelOAuthProduct,
  opts?: {
    shopSlug?: string;
    ttlMs?: number;
    intent?: "login" | "invite";
    guildId?: string;
  },
) {
  const payload: StatePayload = {
    product,
    nonce: randomBytes(8).toString("hex"),
    exp: Date.now() + (opts?.ttlMs ?? 15 * 60 * 1000),
    intent: opts?.intent ?? "login",
    ...(opts?.shopSlug ? { shopSlug: opts.shopSlug } : {}),
    ...(opts?.guildId ? { guildId: opts.guildId } : {}),
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${signBody("panel-oauth-state", body)}`;
}

export function verifyPanelOAuthState(token: string): StatePayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || !verifyBody("panel-oauth-state", body, sig)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as StatePayload;
    if (!payload?.product || !payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function panelOAuthRedirectUri(product: PanelOAuthProduct, shopSlug?: string) {
  if (product === "security") return `${securityOrigin()}/api/security/oauth/callback`;
  if (product === "ticket") return `${ticketOrigin()}/api/ticket/oauth/callback`;
  if (product === "verify") return `${MFA_SITE_ORIGIN}/api/verify/oauth/callback`;
  if (product === "manage") return `${manageOrigin()}/api/manage/oauth/callback`;
  if (isMfaShopSlug(shopSlug)) {
    return `${MFA_SITE_ORIGIN}/api/auth/admin/discord/callback`;
  }
  const app = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://vendix.team";
  return `${app}/api/auth/admin/discord/callback`;
}

export function panelOAuthHome(product: PanelOAuthProduct) {
  if (product === "security") return securityOrigin();
  if (product === "ticket") return ticketOrigin();
  if (product === "verify") return MFA_VERIFY_PANEL_ORIGIN;
  if (product === "manage") return manageOrigin();
  const app = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://vendix.team";
  return app;
}

export async function panelOAuthCredentials(
  product: PanelOAuthProduct,
  shopSlug?: string,
): Promise<{
  applicationId: string;
  clientSecret: string;
} | null> {
  if (product === "security") {
    const env = await securityDiscordEnvAsync();
    const clientSecret =
      env.clientSecret ||
      process.env.SECURITY_DISCORD_CLIENT_SECRET?.trim() ||
      "";
    if (!env.applicationId || !clientSecret) return null;
    return { applicationId: env.applicationId, clientSecret };
  }
  if (product === "ticket") {
    const env = await ticketDiscordEnvAsync();
    if (!env.applicationId || !env.clientSecret) return null;
    return { applicationId: env.applicationId, clientSecret: env.clientSecret };
  }
  if (product === "verify") {
    const env = await verifyDiscordEnvAsync();
    if (!env.applicationId || !env.clientSecret) return null;
    return { applicationId: env.applicationId, clientSecret: env.clientSecret };
  }
  if (product === "manage") {
    const env = await manageDiscordEnvAsync();
    if (!env.applicationId || !env.clientSecret) return null;
    return { applicationId: env.applicationId, clientSecret: env.clientSecret };
  }
  if (isMfaShopSlug(shopSlug)) {
    const does = await doesDiscordEnvAsync();
    if (!does.applicationId || !does.clientSecret) return null;
    return { applicationId: does.applicationId, clientSecret: does.clientSecret };
  }
  const env = await discordEnvAsync();
  if (!env.applicationId || !env.clientSecret) return null;
  return { applicationId: env.applicationId, clientSecret: env.clientSecret };
}

export function buildPanelOAuthAuthorizeUrl(opts: {
  applicationId: string;
  state: string;
  redirectUri: string;
}) {
  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", opts.applicationId);
  url.searchParams.set("scope", PANEL_OAUTH_SCOPES);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("state", opts.state);
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export function buildPanelBotInviteUrl(opts: {
  applicationId: string;
  state: string;
  redirectUri: string;
  guildId: string;
  permissions?: string;
}) {
  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", opts.applicationId);
  url.searchParams.set("scope", PANEL_BOT_INVITE_SCOPES);
  url.searchParams.set("permissions", opts.permissions ?? PANEL_BOT_INVITE_PERMISSIONS);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("state", opts.state);
  url.searchParams.set("guild_id", opts.guildId);
  url.searchParams.set("disable_guild_select", "true");
  return url.toString();
}

export const PANEL_SETUP_COOKIE = "vendix_panel_setup";

export type PanelSetupPayload = {
  product: Exclude<PanelOAuthProduct, "shop">;
  guildId: string;
  password: string;
  recoveryKey?: string;
  exp: number;
};

export function encodePanelSetup(payload: PanelSetupPayload) {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${signBody("panel-setup", body)}`;
}

export function decodePanelSetup(token: string): PanelSetupPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || !verifyBody("panel-setup", body, sig)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as PanelSetupPayload;
    if (!payload?.product || !payload.guildId || !payload.password || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function readPanelSetupFromRequest(
  request: Request,
  product: Exclude<PanelOAuthProduct, "shop">,
): PanelSetupPayload | null {
  const raw = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${PANEL_SETUP_COOKIE}=`))
    ?.slice(PANEL_SETUP_COOKIE.length + 1);
  if (!raw) return null;
  const payload = decodePanelSetup(decodeURIComponent(raw));
  if (!payload || payload.product !== product) return null;
  return payload;
}

export function panelSetupCookieOptions(maxAgeSec = 15 * 60) {
  return panelOAuthCookieOptions(maxAgeSec);
}

/** Discord permission bits: ADMINISTRATOR (3) | MANAGE_GUILD (5) */
const GUILD_ADMIN_BITS = (BigInt(1) << BigInt(3)) | (BigInt(1) << BigInt(5));

function canManageDiscordGuild(g: {
  owner?: boolean;
  permissions?: string | number | null;
}) {
  if (g.owner === true) return true;
  try {
    const perms = BigInt(g.permissions ?? 0);
    return (perms & GUILD_ADMIN_BITS) !== BigInt(0);
  } catch {
    return false;
  }
}

/** Guilds the user owns or can administer (login). Shop create requires owner=true. */
export async function fetchOwnedDiscordGuilds(
  accessToken: string,
): Promise<OwnedDiscordGuild[] | { error: string }> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => null)) as
    | Array<{
        id?: string;
        name?: string;
        icon?: string | null;
        owner?: boolean;
        permissions?: string | number | null;
      }>
    | { message?: string }
    | null;

  if (!res.ok || !Array.isArray(json)) {
    const msg =
      json && !Array.isArray(json) && typeof json.message === "string"
        ? json.message
        : "Discord 서버 목록을 가져오지 못했어요.";
    return { error: msg };
  }

  return json
    .filter((g) => Boolean(g.id && g.name) && canManageDiscordGuild(g))
    .map((g) => ({
      id: g.id!,
      name: g.name!,
      icon: g.icon ?? null,
      owner: g.owner === true,
    }));
}

export async function completePanelOAuth(opts: {
  product: PanelOAuthProduct;
  code: string;
  redirectUri: string;
  shopSlug?: string;
}): Promise<PanelOAuthSession | { error: string }> {
  const creds = await panelOAuthCredentials(opts.product, opts.shopSlug);
  if (!creds) return { error: "Discord OAuth가 설정되지 않았어요." };

  const token = await exchangeDiscordOAuthCode({
    code: opts.code,
    redirectUri: opts.redirectUri,
    applicationId: creds.applicationId,
    clientSecret: creds.clientSecret,
  });
  if ("error" in token) return token;

  const user = await fetchDiscordOAuthUser(token.accessToken);
  if ("error" in user) return user;

  // Soft-fail: guild list is optional for shop admin when discordOwnerId matches.
  const guildsResult = await fetchOwnedDiscordGuilds(token.accessToken);
  const guilds = "error" in guildsResult ? [] : guildsResult;

  return {
    product: opts.product,
    discordUserId: user.id,
    discordUsername: formatDiscordUsername(user),
    ownedGuildIds: guilds.map((g) => g.id),
    ownedGuilds: guilds,
    exp: Date.now() + 10 * 60 * 1000,
  };
}

export const PANEL_OAUTH_COOKIE = "vendix_panel_oauth";

export function encodePanelOAuthSession(session: PanelOAuthSession) {
  // Drop icons and truncate names — full guild lists blow past ~4KB cookie limits.
  const slim: PanelOAuthSession = {
    ...session,
    ownedGuilds: (session.ownedGuilds ?? []).map((g) => ({
      id: g.id,
      name: (g.name || g.id).slice(0, 48),
      icon: null,
      owner: g.owner === true,
    })),
  };
  const body = b64url(JSON.stringify(slim));
  return `${body}.${signBody("panel-oauth-session", body)}`;
}

export function decodePanelOAuthSession(token: string): PanelOAuthSession | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || !verifyBody("panel-oauth-session", body, sig)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as PanelOAuthSession;
    if (!payload?.product || !payload.discordUserId || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    if (!Array.isArray(payload.ownedGuildIds)) return null;
    payload.ownedGuilds = (payload.ownedGuilds ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon ?? null,
      owner: g.owner === true,
    }));
    return payload;
  } catch {
    return null;
  }
}

export function readPanelOAuthSessionFromRequest(
  request: Request,
  product: PanelOAuthProduct,
): PanelOAuthSession | null {
  const raw = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${PANEL_OAUTH_COOKIE}=`))
    ?.slice(PANEL_OAUTH_COOKIE.length + 1);
  if (!raw) return null;
  const session = decodePanelOAuthSession(decodeURIComponent(raw));
  if (!session || session.product !== product) return null;
  return session;
}

export function panelOAuthCookieOptions(maxAgeSec = 10 * 60) {
  const root = getRootDomain().toLowerCase();
  const secure =
    process.env.NODE_ENV === "production" ||
    process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") === true;
  const opts: {
    httpOnly: boolean;
    sameSite: "lax";
    path: string;
    maxAge: number;
    secure: boolean;
    domain?: string;
  } = {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSec,
    secure,
  };
  // Shop OAuth session must be readable on *.vendix.team after apex callback
  if (root !== "localhost") {
    opts.domain = `.${root}`;
  }
  return opts;
}

/** One-time claim ticket so shop host can set host-only admin cookie */
export function createShopAdminClaimTicket(opts: {
  shopId: string;
  shopSlug: string;
  discordUserId: string;
  ttlMs?: number;
}) {
  const payload = {
    shopId: opts.shopId,
    shopSlug: opts.shopSlug,
    discordUserId: opts.discordUserId,
    exp: Date.now() + (opts.ttlMs ?? 2 * 60 * 1000),
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${signBody("shop-admin-claim", body)}`;
}

export function verifyShopAdminClaimTicket(token: string): {
  shopId: string;
  shopSlug: string;
  discordUserId: string;
} | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || !verifyBody("shop-admin-claim", body, sig)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as {
      shopId?: string;
      shopSlug?: string;
      discordUserId?: string;
      exp?: number;
    };
    if (!payload.shopId || !payload.shopSlug || !payload.discordUserId || !payload.exp) {
      return null;
    }
    if (Date.now() > payload.exp) return null;
    return {
      shopId: payload.shopId,
      shopSlug: payload.shopSlug,
      discordUserId: payload.discordUserId,
    };
  } catch {
    return null;
  }
}

export type { DiscordOAuthUser };
