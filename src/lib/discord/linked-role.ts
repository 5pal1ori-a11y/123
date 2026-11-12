import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { DISCORD_API } from "@/lib/discord/components";
import { discordEnvAsync } from "@/lib/discord/verify";
import { getOAuthRedirectOrigin } from "@/lib/domain";
import {
  findUsersByDiscordId,
  getShopSettings,
  initStore,
  listShops,
} from "@/lib/store";

export const LINKED_ROLE_SCOPES = "identify role_connections.write";

const METADATA_TYPE = {
  BOOLEAN_EQUAL: 1,
  INTEGER_GREATER_THAN: 2,
} as const;

export const VENDIX_ROLE_METADATA = [
  {
    key: "verified",
    name: "DOES 인증",
    description: "DOES 연결 역할 인증을 완료했는지 여부",
    type: METADATA_TYPE.BOOLEAN_EQUAL,
  },
  {
    key: "shop_linked",
    name: "상점 계정 연동",
    description: "DOES 상점 계정과 Discord가 연동되어 있는지 여부",
    type: METADATA_TYPE.BOOLEAN_EQUAL,
  },
  {
    key: "total_points",
    name: "보유 포인트",
    description: "연동된 상점 계정들의 보유 포인트 합계",
    type: METADATA_TYPE.INTEGER_GREATER_THAN,
  },
] as const;

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

export function createLinkedRoleState(ttlMs = 10 * 60 * 1000) {
  const payload = {
    n: randomBytes(16).toString("hex"),
    exp: Date.now() + ttlMs,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", authSecret()).update(`lr:${body}`).digest();
  return `${body}.${b64url(sig)}`;
}

export function verifyLinkedRoleState(token: string): boolean {
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const expected = createHmac("sha256", authSecret()).update(`lr:${body}`).digest();
  let given: Buffer;
  try {
    given = fromB64url(sig);
  } catch {
    return false;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as { exp?: number };
    return Boolean(payload?.exp && Date.now() <= payload.exp);
  } catch {
    return false;
  }
}

export function getLinkedRoleRedirectUri(fallbackOrigin?: string) {
  const explicit = process.env.DISCORD_LINKED_ROLE_REDIRECT_URI?.trim().replace(/\/$/, "");
  if (explicit) return explicit;

  const origin = getOAuthRedirectOrigin(fallbackOrigin).replace(/\/$/, "");
  if (origin.includes("vendix.team") || !fallbackOrigin) {
    const app = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://vendix.team";
    return `${app}/api/discord/linked-role/callback`;
  }
  return `${origin}/api/discord/linked-role/callback`;
}

export function buildLinkedRoleAuthorizeUrl(opts: {
  applicationId: string;
  state: string;
  redirectUri: string;
}) {
  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", opts.applicationId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", LINKED_ROLE_SCOPES);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("state", opts.state);
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export async function ensureRoleConnectionMetadata() {
  const env = await discordEnvAsync();
  if (!env.applicationId || !env.botToken) {
    return { ok: false as const, error: "Discord credentials missing" };
  }

  const res = await fetch(
    `${DISCORD_API}/applications/${env.applicationId}/role-connections/metadata`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${env.botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(VENDIX_ROLE_METADATA),
    },
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("[linked-role] metadata register failed", res.status, json);
    return { ok: false as const, error: "metadata register failed", status: res.status, json };
  }
  return { ok: true as const, json };
}

export function computeLinkedRoleMetadata(discordUserId: string) {
  initStore();
  const linkedUsers = findUsersByDiscordId(discordUserId);
  const shopLinked = linkedUsers.length > 0;
  const totalPoints = linkedUsers.reduce((sum, u) => sum + (u.points || 0), 0);
  const ownsShop = listShops().some((shop) => {
    const s = getShopSettings(shop.id);
    return s.discordOwnerId === discordUserId;
  });

  return {
    verified: 1,
    shop_linked: shopLinked || ownsShop ? 1 : 0,
    total_points: totalPoints,
  };
}

export async function pushUserRoleConnection(opts: {
  accessToken: string;
  applicationId: string;
  platformName?: string;
  metadata: Record<string, number>;
}) {
  const res = await fetch(
    `${DISCORD_API}/users/@me/applications/${opts.applicationId}/role-connection`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        platform_name: opts.platformName ?? "DOES",
        platform_username: "vendix.team",
        metadata: opts.metadata,
      }),
    },
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("[linked-role] push metadata failed", res.status, json);
    return { ok: false as const, status: res.status, json };
  }
  return { ok: true as const, json };
}

export function platformLegalUrls(base = "https://vendix.team") {
  const root = base.replace(/\/$/, "");
  return {
    linkedRoleVerificationUrl: `${root}/linked-role`,
    termsUrl: `${root}/terms`,
    privacyUrl: `${root}/privacy`,
  };
}
