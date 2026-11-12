import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { SESSION_IDLE_MINUTES } from "@/lib/session-config";
import { isProduction } from "@/lib/security";

const DEV_FALLBACK_SECRET = "vendix-dev-secret-change-me";

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (isProduction()) {
    if (!secret || secret === DEV_FALLBACK_SECRET || secret.length < 32) {
      throw new Error("AUTH_SECRET must be a random 32+ character value in production.");
    }
    return secret;
  }
  return secret || DEV_FALLBACK_SECRET;
}

function SECRET() {
  try {
    return getAuthSecret();
  } catch {
    return process.env.AUTH_SECRET?.trim() || DEV_FALLBACK_SECRET;
  }
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  // Reject legacy plaintext hashes in all environments
  if (!stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const attempt = scryptSync(password, salt, 64).toString("hex");
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(attempt, "hex"));
  } catch {
    return false;
  }
}

function timingSafeStringEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export type SessionPayload = {
  sub: string;
  shopId?: string;
  role: "user" | "admin" | "platform-admin";
  sid?: string;
  exp: number;
};

function sign(data: string) {
  return createHmac("sha256", SECRET()).update(data).digest("base64url");
}

export function createSessionToken(
  input: Omit<SessionPayload, "exp">,
  ttlMinutes = SESSION_IDLE_MINUTES,
) {
  const payload: SessionPayload = {
    ...input,
    exp: Date.now() + ttlMinutes * 60 * 1000,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const [data, sig] = token.split(".");
  if (!data || !sig || !timingSafeStringEqual(sign(data), sig)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as SessionPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieName(shopSlug: string, role: "user" | "admin") {
  return role === "admin" ? `vendix-admin-${shopSlug}` : `vendix-user-${shopSlug}`;
}

export const PLATFORM_ADMIN_COOKIE = "vendix-platform-admin";

async function platformAdminCredentials() {
  let expectedUser = process.env.PLATFORM_ADMIN_USERNAME?.trim() ?? "";
  let expectedPass = process.env.PLATFORM_ADMIN_PASSWORD ?? "";
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const e = env as Record<string, string | undefined>;
    expectedUser = (e.PLATFORM_ADMIN_USERNAME ?? expectedUser).trim();
    expectedPass = e.PLATFORM_ADMIN_PASSWORD ?? expectedPass;
  } catch {
    // local / non-workers
  }
  if (!expectedUser) expectedUser = "admin";
  // Never fall back to a default password — unset means login disabled
  return { expectedUser, expectedPass: expectedPass.trim() };
}

export function verifyPlatformAdmin(username: string, password: string) {
  const expectedUser = process.env.PLATFORM_ADMIN_USERNAME?.trim() || "admin";
  const expectedPass = process.env.PLATFORM_ADMIN_PASSWORD?.trim() || "";
  if (!expectedPass || expectedPass.length < 8) return false;
  return (
    timingSafeStringEqual(username.trim(), expectedUser) &&
    timingSafeStringEqual(password, expectedPass)
  );
}

export async function verifyPlatformAdminAsync(username: string, password: string) {
  const { expectedUser, expectedPass } = await platformAdminCredentials();
  if (!expectedPass || expectedPass.length < 8) return false;
  return (
    timingSafeStringEqual(username.trim(), expectedUser) &&
    timingSafeStringEqual(password, expectedPass)
  );
}

export function makeDeviceKey() {
  return `vnd_${randomBytes(24).toString("hex")}`;
}

/** HMAC token for public ticket transcript links (unguessable, stable). */
export function ticketTranscriptAccessToken(
  guildId: string,
  usernameSlug: string,
  index: number,
) {
  return createHmac("sha256", SECRET())
    .update(`tt:${guildId}:${usernameSlug}:${index}`)
    .digest("base64url")
    .slice(0, 32);
}

export function timingSafeEqualString(a: string, b: string) {
  return timingSafeStringEqual(a, b);
}
