import { createHmac, timingSafeEqual } from "crypto";
import { DISCORD_API } from "@/lib/discord/components";
import { discordEnv } from "@/lib/discord/verify";
import { getOAuthRedirectOrigin } from "@/lib/domain";

/**
 * Discord 계정 로그인 + 봇 서버 초대 (한 번에)
 * identify: 계정 정보 · guilds: 소속 서버 · bot/commands: 서버에 봇 설치
 */
export const DISCORD_SETUP_SCOPES = "identify guilds bot applications.commands";

/**
 * View Channel, Send Messages, Embed Links, Attach Files,
 * Read Message History, Add Reactions, Use Application Commands
 */
export const DISCORD_BOT_PERMISSIONS = "2147552320";

type SetupPayload = {
  shopId: string;
  slug: string;
  exp: number;
};

export type DiscordOAuthUser = {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  discriminator: string | null;
  email: string | null;
  /** Discord가 인증을 마친 이메일인지 — 아니면 남의 이메일을 적어 둔 계정일 수 있다 */
  emailVerified?: boolean;
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
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(normalized, "base64");
}

export function createDiscordSetupToken(shopId: string, slug: string, ttlMs = 30 * 60 * 1000) {
  const payload: SetupPayload = {
    shopId,
    slug,
    exp: Date.now() + ttlMs,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", authSecret()).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

export function verifyDiscordSetupToken(token: string): SetupPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", authSecret()).update(body).digest();
  let given: Buffer;
  try {
    given = fromB64url(sig);
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as SetupPayload;
    if (!payload?.shopId || !payload?.slug || !payload?.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Discord OAuth redirect must match Developer Portal exactly.
 * Prefer explicit env, then public app URL — never a random Host header.
 */
export function getDiscordOAuthRedirectUri(fallbackOrigin?: string) {
  const explicit = process.env.DISCORD_OAUTH_REDIRECT_URI?.trim().replace(/\/$/, "");
  if (explicit) return explicit;

  const origin = getOAuthRedirectOrigin(fallbackOrigin).replace(/\/$/, "");
  // Always pin production to apex (www / workers.dev Host must not leak into Discord)
  if (origin.includes("vendix.team") || !fallbackOrigin) {
    const app = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://vendix.team";
    return `${app}/api/discord/oauth/callback`;
  }
  return `${origin}/api/discord/oauth/callback`;
}

/** Discord 계정 연동 + 서버에 봇 초대 authorize URL */
export function buildDiscordAccountLinkUrl(opts: {
  applicationId: string;
  state: string;
  redirectUri: string;
  permissions?: string;
}) {
  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", opts.applicationId);
  url.searchParams.set("permissions", opts.permissions ?? DISCORD_BOT_PERMISSIONS);
  url.searchParams.set("scope", DISCORD_SETUP_SCOPES);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("state", opts.state);
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

/** @deprecated use buildDiscordAccountLinkUrl */
export function buildDiscordBotInviteUrl(opts: {
  applicationId: string;
  state: string;
  redirectUri: string;
  permissions?: string;
}) {
  return buildDiscordAccountLinkUrl(opts);
}

export function formatDiscordUsername(user: DiscordOAuthUser) {
  if (user.discriminator && user.discriminator !== "0") {
    return `${user.username}#${user.discriminator}`;
  }
  return user.username || user.globalName || user.id;
}

export async function exchangeDiscordOAuthCode(opts: {
  code: string;
  redirectUri: string;
  applicationId: string;
  clientSecret: string;
}): Promise<{ accessToken: string; refreshToken: string | null } | { error: string }> {
  const body = new URLSearchParams({
    client_id: opts.applicationId,
    client_secret: opts.clientSecret,
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
  });

  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  } | null;

  if (!res.ok || !json?.access_token) {
    const raw = json?.error_description || json?.error || "Discord 토큰 교환에 실패했어요.";
    if (/invalid_client/i.test(raw)) {
      return {
        error:
          "Discord 앱 인증 실패(invalid_client). Developer Portal의 Client Secret이 Cloudflare DISCORD_CLIENT_SECRET과 같은지 확인하세요.",
      };
    }
    return { error: raw };
  }
  return { accessToken: json.access_token, refreshToken: json.refresh_token ?? null };
}

export async function fetchDiscordOAuthUser(
  accessToken: string,
): Promise<DiscordOAuthUser | { error: string }> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => null)) as {
    id?: string;
    username?: string;
    global_name?: string | null;
    avatar?: string | null;
    discriminator?: string | null;
    email?: string | null;
    verified?: boolean;
    message?: string;
  } | null;

  if (!res.ok || !json?.id || !json.username) {
    return { error: json?.message || "Discord 계정 정보를 가져오지 못했어요." };
  }

  return {
    id: json.id,
    username: json.username,
    globalName: json.global_name ?? null,
    avatar: json.avatar ?? null,
    discriminator: json.discriminator ?? null,
    email: json.email?.trim() || null,
    emailVerified: json.verified === true,
  };
}

export function discordInviteAvailable() {
  const { applicationId } = discordEnv();
  return Boolean(applicationId);
}

/** Classic "Add to Server" link — no redirect_uri (OAuth Portal 등록 불필요) */
export function buildDiscordBotInstallUrl(opts: {
  applicationId: string;
  permissions?: string;
}) {
  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", opts.applicationId);
  url.searchParams.set("permissions", opts.permissions ?? DISCORD_BOT_PERMISSIONS);
  url.searchParams.set("scope", "bot applications.commands");
  return url.toString();
}
