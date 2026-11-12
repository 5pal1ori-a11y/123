import { PLATFORM_ADMIN_COOKIE, sessionCookieName, verifySessionToken } from "@/lib/auth";
import { readCookieFromHeader } from "@/lib/session-cookie";

export function readCookie(request: Request, name: string) {
  return readCookieFromHeader(request.headers.get("cookie") ?? "", name);
}

export function getPlatformAdminFromRequestEdge(request: Request) {
  const token = readCookie(request, PLATFORM_ADMIN_COOKIE);
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload || payload.role !== "platform-admin") return null;
  return { username: payload.sub };
}

export function getSessionFromRequestEdge(
  request: Request,
  shopSlug: string,
  role: "user" | "admin",
) {
  const token = readCookie(request, sessionCookieName(shopSlug, role));
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload || payload.role !== role) return null;
  // Edge cannot validate sid against KV — require sid present; full check in API routes
  if (!payload.sid || !payload.shopId) return null;
  return payload;
}
