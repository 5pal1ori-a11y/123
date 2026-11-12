import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getOAuthRedirectOrigin, MFA_SITE_ORIGIN } from "@/lib/domain";
import { verifyDiscordEnvAsync } from "@/lib/verify-bot/env";

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

export function createVerifyOAuthState(
  guildId: string,
  meta?: { channelId?: string; campaign?: string },
  ttlMs = 10 * 60 * 1000,
) {
  const payload = {
    g: guildId,
    c: meta?.channelId || null,
    p: meta?.campaign || null,
    n: randomBytes(12).toString("hex"),
    exp: Date.now() + ttlMs,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", authSecret()).update(`vb:${body}`).digest();
  return `${body}.${b64url(sig)}`;
}

export function verifyOAuthState(
  token: string,
): { guildId: string; channelId: string | null; campaign: string | null } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", authSecret()).update(`vb:${body}`).digest();
  let given: Buffer;
  try {
    given = fromB64url(sig);
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as {
      g?: string;
      c?: string | null;
      p?: string | null;
      exp?: number;
    };
    if (!payload.g || !payload.exp || Date.now() > payload.exp) return null;
    return {
      guildId: payload.g,
      channelId: payload.c || null,
      campaign: payload.p || null,
    };
  } catch {
    return null;
  }
}

export function getVerifyOAuthRedirectUri() {
  const explicit = process.env.VERIFY_DISCORD_OAUTH_REDIRECT_URI?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "";
  if (root === "localhost") {
    return `${getOAuthRedirectOrigin().replace(/\/$/, "")}/api/verify-bot/oauth/callback`;
  }
  return `${MFA_SITE_ORIGIN}/api/verify-bot/oauth/callback`;
}

function verifyScopes(includeEmail: boolean) {
  // guilds.join enables later /복구 member add via stored refresh token
  const scopes = ["identify", "guilds.join"];
  if (includeEmail) scopes.push("email");
  return scopes.join(" ");
}

export async function buildVerifyAuthorizeUrl(opts: {
  guildId: string;
  state: string;
  includeEmail: boolean;
}) {
  const env = await verifyDiscordEnvAsync();
  if (!env.applicationId) throw new Error("VERIFY_DISCORD_APPLICATION_ID missing");
  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", env.applicationId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", verifyScopes(opts.includeEmail));
  url.searchParams.set("redirect_uri", getVerifyOAuthRedirectUri());
  url.searchParams.set("state", opts.state);
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export async function exchangeVerifyOAuthCode(code: string) {
  const env = await verifyDiscordEnvAsync();
  if (!env.applicationId || !env.clientSecret) {
    return { error: "Verify bot OAuth credentials missing" } as const;
  }
  const body = new URLSearchParams({
    client_id: env.applicationId,
    client_secret: env.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: getVerifyOAuthRedirectUri(),
  });
  const res = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  } | null;
  if (!res.ok || !json?.access_token) {
    return {
      error: json?.error_description || json?.error || "토큰 교환 실패",
    } as const;
  }
  if (!json.refresh_token) {
    console.warn("[verify-oauth] token exchange missing refresh_token", json.scope);
  }
  if (json.scope && !json.scope.split(/[\s+]+/).includes("guilds.join")) {
    console.warn("[verify-oauth] token missing guilds.join scope:", json.scope);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    scope: json.scope ?? null,
  } as const;
}

export async function refreshVerifyOAuthToken(refreshToken: string) {
  const env = await verifyDiscordEnvAsync();
  if (!env.applicationId || !env.clientSecret) {
    return { error: "Verify bot OAuth credentials missing" } as const;
  }
  const body = new URLSearchParams({
    client_id: env.applicationId,
    client_secret: env.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    error_description?: string;
    error?: string;
  } | null;
  if (!res.ok || !json?.access_token) {
    return {
      error: json?.error_description || json?.error || "토큰 갱신 실패",
    } as const;
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
  } as const;
}

export async function fetchVerifyOAuthUser(accessToken: string) {
  const res = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => null)) as {
    id?: string;
    username?: string;
    global_name?: string | null;
    email?: string | null;
    message?: string;
  } | null;
  if (!res.ok || !json?.id || !json.username) {
    return { error: json?.message || "유저 정보 조회 실패" } as const;
  }
  return {
    id: json.id,
    username: json.username,
    email: json.email ?? null,
    verified: Boolean((json as { verified?: boolean }).verified),
    phone: typeof (json as { phone?: unknown }).phone === "string"
      ? String((json as { phone?: string }).phone)
      : null,
  } as const;
}
