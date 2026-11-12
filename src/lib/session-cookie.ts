import {
  createSessionToken,
  PLATFORM_ADMIN_COOKIE,
  sessionCookieName,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/auth";
import { SESSION_COOKIE_MAX_AGE_SEC } from "@/lib/session-config";

export type SessionRole = SessionPayload["role"];

/**
 * Host-only cookies (no Domain attribute) so shop A cannot receive shop B cookies.
 * Secure in production.
 */
export function sessionCookieBaseOptions() {
  const secure =
    process.env.NODE_ENV === "production" ||
    process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") === true;
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SEC,
    secure,
  };
}

export function readCookieFromHeader(cookieHeader: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function issueToken(payload: Omit<SessionPayload, "exp">) {
  return createSessionToken(payload);
}

/**
 * Sliding refresh for platform admin only.
 * Shop user/admin cookies are refreshed only after server-side sid validation
 * in route handlers — never blindly in middleware (prevents revoking bypass).
 */
export function refreshSessionCookies(
  setCookie: (name: string, value: string, options: ReturnType<typeof sessionCookieBaseOptions>) => void,
  cookieHeader: string,
  _shopSlug?: string | null,
) {
  try {
    void _shopSlug;
    const platformToken = readCookieFromHeader(cookieHeader, PLATFORM_ADMIN_COOKIE);
    if (platformToken) {
      const payload = verifySessionToken(platformToken);
      if (payload?.role === "platform-admin") {
        setCookie(
          PLATFORM_ADMIN_COOKIE,
          issueToken({ sub: payload.sub, role: "platform-admin" }),
          sessionCookieBaseOptions(),
        );
      }
    }
  } catch {
    // ignore cookie refresh failures
  }
}
