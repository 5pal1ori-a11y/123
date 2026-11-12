import { createHmac, timingSafeEqual } from "crypto";

const COOKIE = "vendix_manage_admin";

function secret() {
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

export function createManageAdminToken(guildId: string, ttlMs = 12 * 60 * 60 * 1000) {
  const payload = { g: guildId, exp: Date.now() + ttlMs };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret()).update(`ma:${body}`).digest();
  return `${body}.${b64url(sig)}`;
}

export function verifyManageAdminToken(token: string): { guildId: string } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(`ma:${body}`).digest();
  let given: Buffer;
  try {
    given = fromB64url(sig);
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as { g?: string; exp?: number };
    if (!payload.g || !payload.exp || Date.now() > payload.exp) return null;
    return { guildId: payload.g };
  } catch {
    return null;
  }
}

export function manageAdminCookieName() {
  return COOKIE;
}

export function readManageAdminFromRequest(request: Request, guildId: string) {
  const raw = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!raw) return null;
  const token = decodeURIComponent(raw);
  const parsed = verifyManageAdminToken(token);
  if (!parsed || parsed.guildId !== guildId) return null;
  return parsed;
}

export function manageAdminCookieOptions(maxAgeSec = 12 * 60 * 60) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}
