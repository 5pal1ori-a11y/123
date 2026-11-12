import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getOAuthRedirectOrigin, MFA_SITE_ORIGIN } from "@/lib/domain";
import { isMfaShopSlug } from "@/lib/discord/does-env";

const USER_OAUTH_SCOPES = "identify email";
const MFA_USER_OAUTH_SCOPES = "identify email guilds.join";

function shopUserOAuthScopes(shopSlug?: string) {
  return isMfaShopSlug(shopSlug) ? MFA_USER_OAUTH_SCOPES : USER_OAUTH_SCOPES;
}

type StatePayload = {
  shopSlug: string;
  nonce: string;
  exp: number;
  returnPath?: string;
  /** 로그인한 계정에 연동하는 흐름이면 그 계정 ID */
  linkUserId?: string;
};

type ClaimPayload = {
  shopId: string;
  shopSlug: string;
  userId: string;
  discordId: string;
  discordUsername: string;
  email: string | null;
  avatar: string | null;
  exp: number;
  /** 연동 흐름: 연동을 시작한 계정 (합쳐졌으면 userId 와 다르다) */
  linkFrom?: string;
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

export function getShopUserDiscordRedirectUri(fallbackOrigin?: string, shopSlug?: string) {
  if (isMfaShopSlug(shopSlug)) {
    return `${MFA_SITE_ORIGIN}/api/auth/user/discord/callback`;
  }
  const explicit = process.env.DISCORD_USER_OAUTH_REDIRECT_URI?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const origin = getOAuthRedirectOrigin(fallbackOrigin).replace(/\/$/, "");
  return `${origin}/api/auth/user/discord/callback`;
}

export function createShopUserOAuthState(opts: {
  shopSlug: string;
  returnPath?: string;
  linkUserId?: string;
  ttlMs?: number;
}) {
  const payload: StatePayload = {
    shopSlug: opts.shopSlug,
    nonce: randomBytes(8).toString("hex"),
    exp: Date.now() + (opts.ttlMs ?? 15 * 60 * 1000),
    ...(opts.returnPath ? { returnPath: opts.returnPath } : {}),
    ...(opts.linkUserId ? { linkUserId: opts.linkUserId } : {}),
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${signBody("shop-user-oauth-state", body)}`;
}

export function verifyShopUserOAuthState(token: string): StatePayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || !verifyBody("shop-user-oauth-state", body, sig)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as StatePayload;
    if (!payload?.shopSlug || !payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildShopUserDiscordAuthorizeUrl(opts: {
  applicationId: string;
  state: string;
  redirectUri: string;
  shopSlug?: string;
}) {
  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", opts.applicationId);
  url.searchParams.set("scope", shopUserOAuthScopes(opts.shopSlug));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("state", opts.state);
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export function createShopUserClaimTicket(opts: {
  shopId: string;
  shopSlug: string;
  userId: string;
  discordId: string;
  discordUsername: string;
  email?: string | null;
  avatar?: string | null;
  linkFrom?: string;
  ttlMs?: number;
}) {
  const payload: ClaimPayload = {
    shopId: opts.shopId,
    shopSlug: opts.shopSlug,
    userId: opts.userId,
    discordId: opts.discordId,
    discordUsername: opts.discordUsername,
    email: opts.email ?? null,
    avatar: opts.avatar ?? null,
    exp: Date.now() + (opts.ttlMs ?? 5 * 60 * 1000),
    ...(opts.linkFrom ? { linkFrom: opts.linkFrom } : {}),
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${signBody("shop-user-claim", body)}`;
}

export function verifyShopUserClaimTicket(token: string): ClaimPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || !verifyBody("shop-user-claim", body, sig)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as ClaimPayload;
    if (!payload?.shopId || !payload.shopSlug || !payload.userId || !payload.exp) return null;
    if (!payload.discordId || !payload.discordUsername) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function discordAvatarUrl(userId: string, avatar: string | null) {
  if (!avatar) return null;
  const ext = avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${ext}?size=128`;
}
