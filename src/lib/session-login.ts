import { NextResponse } from "next/server";
import { clientIp, clientUserAgent } from "@/lib/request-meta";
import { applySessionCookie, setSessionCookie } from "@/lib/session-server";
import { persistAsync } from "@/lib/store";
import { createAuthSession, recordLoginHistory } from "@/lib/store-ext";

export async function establishUserSession(
  request: Request,
  shop: { id: string; slug: string },
  userId: string,
  response?: NextResponse,
) {
  const ip = clientIp(request);
  const ua = clientUserAgent(request);
  const session = createAuthSession({
    shopId: shop.id,
    subjectId: userId,
    role: "user",
    ip,
    userAgent: ua,
  });
  recordLoginHistory({
    shopId: shop.id,
    subjectId: userId,
    role: "user",
    ip,
    userAgent: ua,
  });
  await persistAsync();
  const payload = { sub: userId, shopId: shop.id, sid: session.id };
  await setSessionCookie(shop.slug, "user", payload);
  if (response) applySessionCookie(response, shop.slug, "user", payload);
  return session;
}

export async function establishAdminSession(
  request: Request,
  shop: { id: string; slug: string },
  adminUsername: string,
  response?: NextResponse,
) {
  const ip = clientIp(request);
  const ua = clientUserAgent(request);
  const session = createAuthSession({
    shopId: shop.id,
    subjectId: adminUsername,
    role: "admin",
    ip,
    userAgent: ua,
  });
  recordLoginHistory({
    shopId: shop.id,
    subjectId: adminUsername,
    role: "admin",
    ip,
    userAgent: ua,
  });
  const payload = { sub: adminUsername, shopId: shop.id, sid: session.id };
  // Set cookie on the redirect response first — Workers may ignore cookies() alone.
  if (response) applySessionCookie(response, shop.slug, "admin", payload);
  try {
    await setSessionCookie(shop.slug, "admin", payload);
  } catch {
    /* response cookie is enough */
  }
  try {
    await persistAsync();
  } catch {
    /* JWT + rehydrate covers missing sid in KV briefly */
  }
  return session;
}
