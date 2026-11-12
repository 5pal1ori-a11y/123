import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createSessionToken,
  PLATFORM_ADMIN_COOKIE,
  sessionCookieName,
  verifySessionToken,
} from "@/lib/auth";
import { readCookieFromHeader, sessionCookieBaseOptions } from "@/lib/session-cookie";
import { getShopBySlug, getUserById } from "@/lib/store";
import { isAuthSessionValid, rehydrateAuthSession, touchAuthSession } from "@/lib/store-ext";

function sessionCookieOptions() {
  return sessionCookieBaseOptions();
}

async function touchSessionCookie(
  cookieName: string,
  payload: { sub: string; shopId?: string; role: "user" | "admin" | "platform-admin"; sid?: string },
) {
  try {
    const jar = await cookies();
    const token = createSessionToken(payload);
    jar.set(cookieName, token, sessionCookieOptions());
  } catch {
    // cookie refresh may fail during static/edge renders
  }
}

/** Prefer attaching Set-Cookie on the response — more reliable on Workers/mobile. */
export function applySessionCookie(
  response: NextResponse,
  shopSlug: string,
  role: "user" | "admin",
  payload: { sub: string; shopId: string; sid?: string },
) {
  const token = createSessionToken({ ...payload, role });
  response.cookies.set(sessionCookieName(shopSlug, role), token, sessionCookieOptions());
  return response;
}

export async function setSessionCookie(
  shopSlug: string,
  role: "user" | "admin",
  payload: { sub: string; shopId: string; sid?: string },
) {
  const token = createSessionToken({ ...payload, role });
  try {
    const jar = await cookies();
    jar.set(sessionCookieName(shopSlug, role), token, sessionCookieOptions());
  } catch {
    // OpenNext/Workers may reject cookies() mutation — caller should also use applySessionCookie
  }
}

export async function setPlatformAdminSession(username: string) {
  const token = createSessionToken({ sub: username, role: "platform-admin" });
  const jar = await cookies();
  jar.set(PLATFORM_ADMIN_COOKIE, token, sessionCookieOptions());
}

export async function clearPlatformAdminSession() {
  const jar = await cookies();
  jar.set(PLATFORM_ADMIN_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
}

export async function getPlatformAdminSession() {
  const jar = await cookies();
  const token = jar.get(PLATFORM_ADMIN_COOKIE)?.value;
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload || payload.role !== "platform-admin") return null;
  await touchSessionCookie(PLATFORM_ADMIN_COOKIE, {
    sub: payload.sub,
    role: "platform-admin",
  });
  return { username: payload.sub };
}

export function getPlatformAdminFromRequest(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = readCookieFromHeader(cookieHeader, PLATFORM_ADMIN_COOKIE);
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload || payload.role !== "platform-admin") return null;
  return { username: payload.sub };
}

export async function clearSessionCookie(shopSlug: string, role: "user" | "admin") {
  const jar = await cookies();
  jar.set(sessionCookieName(shopSlug, role), "", { ...sessionCookieOptions(), maxAge: 0 });
}

export async function getAdminSession(shopSlug: string) {
  const jar = await cookies();
  const token = jar.get(sessionCookieName(shopSlug, "admin"))?.value;
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload || payload.role !== "admin") return null;
  if (!payload.sid || !payload.shopId) return null;
  if (!isAuthSessionValid(payload.sid)) {
    rehydrateAuthSession({
      id: payload.sid,
      shopId: payload.shopId,
      subjectId: payload.sub,
      role: "admin",
    });
  }
  if (!isAuthSessionValid(payload.sid)) return null;
  const shop = getShopBySlug(shopSlug);
  if (!shop || shop.id !== payload.shopId) return null;
  if (payload.sid) touchAuthSession(payload.sid);
  await touchSessionCookie(sessionCookieName(shopSlug, "admin"), {
    sub: payload.sub,
    shopId: payload.shopId,
    role: "admin",
    sid: payload.sid,
  });
  return { shop, adminId: payload.sub, sessionId: payload.sid };
}

export async function getUserSession(shopSlug: string, request?: Request) {
  const cookieName = sessionCookieName(shopSlug, "user");
  let token: string | null = null;
  try {
    const jar = await cookies();
    token = jar.get(cookieName)?.value ?? null;
  } catch {
    token = null;
  }
  if (!token && request) {
    token = readCookieFromHeader(request.headers.get("cookie") ?? "", cookieName);
  }
  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload || payload.role !== "user") return null;
  if (!payload.sid || !payload.shopId) return null;

  if (!isAuthSessionValid(payload.sid)) {
    rehydrateAuthSession({
      id: payload.sid,
      shopId: payload.shopId,
      subjectId: payload.sub,
      role: "user",
    });
  }
  if (!isAuthSessionValid(payload.sid)) return null;

  const shop = getShopBySlug(shopSlug);
  if (!shop || shop.id !== payload.shopId) return null;
  const user = getUserById(payload.sub);
  if (!user || user.shopId !== shop.id || user.banned) return null;

  touchAuthSession(payload.sid);

  await touchSessionCookie(cookieName, {
    sub: payload.sub,
    shopId: payload.shopId,
    role: "user",
    sid: payload.sid,
  });
  return { shop, user, sessionId: payload.sid };
}

export function getSessionFromRequest(request: Request, shopSlug: string, role: "user" | "admin") {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const name = sessionCookieName(shopSlug, role);
  const token = readCookieFromHeader(cookieHeader, name);
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload || payload.role !== role) return null;
  if (!payload.sid || !payload.shopId) return null;
  if (!isAuthSessionValid(payload.sid)) {
    rehydrateAuthSession({
      id: payload.sid,
      shopId: payload.shopId,
      subjectId: payload.sub,
      role,
    });
  }
  if (!isAuthSessionValid(payload.sid)) return null;
  touchAuthSession(payload.sid);
  return payload;
}
