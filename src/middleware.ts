import { NextResponse } from "next/server";
import { customShopDomain, getRootDomain, isManageHost, isMfaSiteHost, isSecurityHost, isTicketHost, isVerifyHost, MFA_SITE_HOST, MFA_VERIFY_HOST, slugFromHost } from "@/lib/domain";
import { findShopBySlugEdge } from "@/lib/store-edge";
import { initStoreKvOnly } from "@/lib/store-init";
import { refreshSessionCookies } from "@/lib/session-cookie";
import { assertSameOrigin } from "@/lib/csrf";

let runtimeConfigChecked = false;
let runtimeConfigOk = true;

function ensureRuntimeConfig() {
  if (runtimeConfigChecked) return runtimeConfigOk;
  runtimeConfigChecked = true;
  if (process.env.NODE_ENV !== "production") {
    runtimeConfigOk = true;
    return true;
  }
  const authSecret = process.env.AUTH_SECRET?.trim();
  const platformPassword = process.env.PLATFORM_ADMIN_PASSWORD?.trim();
  // OpenNext Edge middleware often cannot see wrangler secrets on process.env.
  // Missing values here must NOT fail-closed — Node handlers still enforce secrets.
  // Only reject when Edge can see an explicitly insecure value.
  if (
    (authSecret &&
      (authSecret === "vendix-dev-secret-change-me" || authSecret.length < 32)) ||
    (platformPassword &&
      (platformPassword.includes("change-me") ||
        platformPassword === "qwer1234" ||
        platformPassword.length < 8))
  ) {
    console.error(
      "[vendix] insecure runtime config: set AUTH_SECRET (32+) and PLATFORM_ADMIN_PASSWORD (8+, not default)",
    );
    runtimeConfigOk = false;
  } else {
    runtimeConfigOk = true;
  }
  return runtimeConfigOk;
}

const SHOP_SHORTCUTS: Record<string, string> = {
  "/": "/dashboard",
  "/products": "/dashboard?tab=products",
  "/purchase": "/dashboard?tab=purchase",
  "/charge": "/dashboard?tab=charge",
  "/settings": "/dashboard?tab=account",
  "/download": "/dashboard",
};

function securityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
}

function withSessionRefresh(response: NextResponse, request: Request, shopSlug?: string | null) {
  try {
    const cookieHeader = request.headers.get("cookie") ?? "";
    refreshSessionCookies(
      (name, value, options) => {
        response.cookies.set(name, value, options);
      },
      cookieHeader,
      shopSlug,
    );
  } catch {
    // never fail the request because of cookie refresh
  }
  return securityHeaders(response);
}

function redirectResponse(request: Request, targetPath: string, shopSlug?: string | null, status = 307) {
  const url = new URL(request.url);
  return withSessionRefresh(securityHeaders(NextResponse.redirect(new URL(targetPath, url), status)), request, shopSlug);
}

function deny(message = "Unauthorized") {
  return securityHeaders(NextResponse.json({ error: message }, { status: 401 }));
}

function isShopAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function rewriteShopPath(url: URL, slug: string, pathname: string) {
  const rewriteUrl = new URL(url);
  rewriteUrl.pathname = pathname === "/" ? `/s/${slug}` : `/s/${slug}${pathname}`;
  return rewriteUrl;
}

function redirectToShopSubdomain(request: Request, shopSlug: string, restPath: string) {
  const root = getRootDomain();
  const url = new URL(request.url);
  const redirectUrl = new URL(url);
  redirectUrl.pathname = restPath || "/";

  const custom = customShopDomain(shopSlug);
  if (root === "localhost") {
    redirectUrl.hostname = `${shopSlug}.localhost`;
  } else if (custom) {
    redirectUrl.hostname = custom;
    redirectUrl.protocol = "https:";
  } else {
    redirectUrl.hostname = `${shopSlug}.${root}`;
    redirectUrl.protocol = "https:";
  }

  return securityHeaders(NextResponse.redirect(redirectUrl, 308));
}

function shopRewriteResponse(
  request: Request,
  url: URL,
  slug: string,
  pathname: string,
  requestHeaders: Headers,
) {
  if (
    pathname === "/terms" ||
    pathname === "/privacy" ||
    pathname === "/does-terms" ||
    /^\/ticket\/[^/]+\/[^/]+\/\d+\/?$/.test(pathname)
  ) {
    return withSessionRefresh(NextResponse.next(), request, slug);
  }
  if (isShopAdminPath(pathname)) {
    requestHeaders.set("x-vendix-route", "shop-admin");
  }
  return withSessionRefresh(
    NextResponse.rewrite(rewriteShopPath(url, slug, pathname), {
      request: { headers: requestHeaders },
    }),
    request,
    slug,
  );
}

export async function middleware(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? "";
  const root = getRootDomain();
  const slug = slugFromHost(host, root);
  const { pathname } = url;

  if (pathname === "/%EC%9D%B4%EC%9A%A9%EC%95%BD%EA%B4%80" || pathname === "/이용약관") {
    return securityHeaders(NextResponse.rewrite(new URL("/does-terms", request.url)));
  }

  const customDomain = slug && root !== "localhost" ? customShopDomain(slug) : null;
  if (customDomain && host.split(":")[0]?.toLowerCase() !== customDomain && request.method === "GET") {
    const target = new URL(url);
    target.protocol = "https:";
    target.host = customDomain;
    return securityHeaders(NextResponse.redirect(target, 308));
  }

  // Discord interaction validation is latency-sensitive — skip KV/session work
  if (
    pathname === "/api/manage-bot/interactions" ||
    pathname === "/api/verify-bot/interactions" ||
    pathname === "/api/ticket-bot/interactions" ||
    pathname === "/api/security-bot/interactions" ||
    pathname === "/api/discord/interactions"
  ) {
    return securityHeaders(NextResponse.next());
  }

  try {
    const botHost =
      isSecurityHost(host, root) ||
      isTicketHost(host, root) ||
      isVerifyHost(host, root) ||
      isManageHost(host, root);

    if (!ensureRuntimeConfig() && !botHost) {
      // Fail closed for mutating APIs and admin surfaces when secrets are missing
      if (
        pathname.startsWith("/api/") &&
        request.method !== "GET" &&
        request.method !== "HEAD" &&
        !pathname.startsWith("/api/webhooks/") &&
        pathname !== "/api/discord/interactions" &&
        pathname !== "/api/ticket-bot/interactions" &&
        !pathname.startsWith("/api/ticket-bot/") &&
        !pathname.startsWith("/api/ticket/") &&
        pathname !== "/api/verify-bot/interactions" &&
        !pathname.startsWith("/api/verify-bot/") &&
        !pathname.startsWith("/api/verify/") &&
        pathname !== "/api/security-bot/interactions" &&
        !pathname.startsWith("/api/security-bot/") &&
        !pathname.startsWith("/api/security/") &&
        pathname !== "/api/manage-bot/interactions" &&
        !pathname.startsWith("/api/manage-bot/") &&
        !pathname.startsWith("/api/manage/") &&
        !pathname.startsWith("/api/auth/platform/") &&
        !pathname.startsWith("/api/auth/admin/discord/")
      ) {
        return securityHeaders(
          NextResponse.json({ error: "Server misconfigured" }, { status: 503 }),
        );
      }
      // Allow login UI so operators can recover; do NOT block /admin shell here.
      // Edge often lacks wrangler secrets — a false "misconfigured" wall broke Discord admin login
      // after a successful OAuth claim (login page worked, /admin returned 503).
      if (pathname.startsWith("/platform-admin") && pathname !== "/platform-admin/login") {
        return securityHeaders(
          new NextResponse("Server misconfigured — check AUTH_SECRET / PLATFORM_ADMIN_PASSWORD", {
            status: 503,
          }),
        );
      }
    }

    if (pathname.startsWith("/api/") && request.method !== "GET" && request.method !== "HEAD") {
      // Webhooks / auto-charge use token auth, not cookies — skip Origin check
      const skipCsrf =
        pathname.startsWith("/api/webhooks/") ||
        pathname === "/api/charges/auto" ||
        pathname.startsWith("/api/charges/auto/") ||
        pathname === "/api/discord/interactions" ||
        pathname === "/api/discord/internal" ||
        pathname === "/api/discord/sync-commands" ||
        pathname === "/api/discord/giveaway/end" ||
        pathname === "/api/discord/ticket-ai" ||
        pathname === "/api/discord/server-status" ||
        pathname === "/api/verify-bot/interactions" ||
        pathname.startsWith("/api/verify-bot/") ||
        pathname === "/api/ticket-bot/interactions" ||
        pathname.startsWith("/api/ticket-bot/") ||
        pathname === "/api/security-bot/interactions" ||
        pathname.startsWith("/api/security-bot/") ||
        pathname.startsWith("/api/security/") ||
        pathname === "/api/manage-bot/interactions" ||
        pathname.startsWith("/api/manage-bot/") ||
        pathname.startsWith("/api/manage/") ||
        pathname.startsWith("/api/auth/admin/discord/");
      if (!skipCsrf) {
        const csrf = assertSameOrigin(request);
        if (csrf) return securityHeaders(csrf);
      }
    }

    try {
      await initStoreKvOnly();
    } catch {
      // continue without KV
    }

    if (pathname === "/favicon.ico") {
      return securityHeaders(NextResponse.redirect(new URL("/does-logo.png", url), 308));
    }

    if (pathname.includes("db.json") || pathname.startsWith("/data/")) {
      return securityHeaders(new NextResponse("Not Found", { status: 404 }));
    }

    // verify.doesmc.xyz → doesmc.xyz/verify
    const hostname = host.split(":")[0]?.toLowerCase() ?? "";
    if (hostname === MFA_VERIFY_HOST && !pathname.startsWith("/api/") && !pathname.startsWith("/_next/")) {
      const dest = new URL(url);
      dest.protocol = "https:";
      dest.host = MFA_SITE_HOST;
      dest.pathname = pathname.startsWith("/verify")
        ? pathname
        : pathname === "/"
          ? "/verify"
          : `/verify${pathname}`;
      return securityHeaders(NextResponse.redirect(dest, 308));
    }

    // doesmc.xyz/verify — shop host but verify panel
    if (isMfaSiteHost(host) && (pathname === "/verify" || pathname.startsWith("/verify/"))) {
      return withSessionRefresh(NextResponse.next(), request, null);
    }

    // verify.vendix.team → /verify/*
    if (isVerifyHost(host, root)) {
      if (pathname.startsWith("/api/") || pathname.startsWith("/_next/")) {
        return withSessionRefresh(NextResponse.next(), request, null);
      }
      if (pathname.startsWith("/verify")) {
        return withSessionRefresh(NextResponse.next(), request, null);
      }
      const rewriteUrl = new URL(url);
      rewriteUrl.pathname = pathname === "/" ? "/verify" : `/verify${pathname}`;
      return withSessionRefresh(
        NextResponse.rewrite(rewriteUrl, {
          request: { headers: request.headers },
        }),
        request,
        null,
      );
    }

    // ticket.vendix.team → /ticket/*
    if (isTicketHost(host, root)) {
      if (pathname.startsWith("/api/") || pathname.startsWith("/_next/")) {
        return withSessionRefresh(NextResponse.next(), request, null);
      }
      if (pathname.startsWith("/ticket")) {
        return withSessionRefresh(NextResponse.next(), request, null);
      }
      const rewriteUrl = new URL(url);
      rewriteUrl.pathname = pathname === "/" ? "/ticket" : `/ticket${pathname}`;
      return withSessionRefresh(
        NextResponse.rewrite(rewriteUrl, {
          request: { headers: request.headers },
        }),
        request,
        null,
      );
    }

    // security.vendix.team → /security/*
    if (isSecurityHost(host, root)) {
      if (pathname.startsWith("/api/") || pathname.startsWith("/_next/")) {
        return withSessionRefresh(NextResponse.next(), request, null);
      }
      if (pathname.startsWith("/security")) {
        return withSessionRefresh(NextResponse.next(), request, null);
      }
      const rewriteUrl = new URL(url);
      rewriteUrl.pathname = pathname === "/" ? "/security" : `/security${pathname}`;
      return withSessionRefresh(
        NextResponse.rewrite(rewriteUrl, {
          request: { headers: request.headers },
        }),
        request,
        null,
      );
    }

    // manage.vendix.team → /manage/*
    if (isManageHost(host, root)) {
      if (pathname.startsWith("/api/") || pathname.startsWith("/_next/")) {
        return withSessionRefresh(NextResponse.next(), request, null);
      }
      if (pathname.startsWith("/manage")) {
        return withSessionRefresh(NextResponse.next(), request, null);
      }
      const rewriteUrl = new URL(url);
      rewriteUrl.pathname = pathname === "/" ? "/manage" : `/manage${pathname}`;
      return withSessionRefresh(
        NextResponse.rewrite(rewriteUrl, {
          request: { headers: request.headers },
        }),
        request,
        null,
      );
    }

    if (pathname.startsWith("/s/")) {
      const match = pathname.match(/^\/s\/([a-z0-9-]+)(\/.*)?$/i);
      if (match) {
        return redirectToShopSubdomain(request, match[1].toLowerCase(), match[2] ?? "/");
      }
    }

    const shopAdminPaths = ["/api/inventory", "/api/logs", "/api/stats"];
    const needsShopAdmin =
      shopAdminPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
      (pathname === "/api/orders" && request.method === "GET") ||
      (pathname.startsWith("/api/products") && request.method !== "GET") ||
      (pathname.includes("/api/orders/") && pathname.endsWith("/pay"));

    if (needsShopAdmin) {
      const shopSlug = slug ?? request.headers.get("x-orel-shop") ?? url.searchParams.get("shop");
      if (!shopSlug) return deny("상점 컨텍스트가 없습니다.");
      const shopRow = findShopBySlugEdge(shopSlug);
      if (!shopRow) {
        return securityHeaders(NextResponse.json({ error: "상점을 찾을 수 없습니다." }, { status: 404 }));
      }
      // Auth is enforced in Node route handlers (isShopAdmin). Edge HMAC is unreliable here.
    }

    if (!slug) {
      // Platform admin auth is enforced in the page/API (Node runtime).
      // Middleware must not verify HMAC here — Edge lacks reliable Node crypto.
      if (pathname === "/admin" || pathname === "/admin/login") {
        return redirectResponse(request, pathname.replace("/admin", "/platform-admin"), null);
      }
      return withSessionRefresh(NextResponse.next(), request, null);
    }

    if (pathname === "/platform-admin" || pathname.startsWith("/platform-admin/")) {
      return redirectResponse(request, "/admin/login", slug);
    }

    // DOES 첫 화면은 랜딩. 로그인 실패 안내 등 쿼리가 붙은 링크는 전처럼 월드(로그인 화면)로 보낸다
    const mfaLanding = pathname === "/" && slug === "mfa";
    if (mfaLanding && url.search) {
      return redirectResponse(request, `/main${url.search}`, slug);
    }
    const shortcut = mfaLanding ? undefined : SHOP_SHORTCUTS[pathname];
    if (shortcut) {
      return redirectResponse(request, shortcut, slug);
    }

    // Do NOT gate /admin on Edge session verify — Node getAdminSession enforces auth.
    // Edge often lacks AUTH_SECRET, so HMAC verify falsely rejects valid admin cookies.

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-orel-shop", slug);

    if (pathname.startsWith("/api/")) {
      return withSessionRefresh(NextResponse.next({ request: { headers: requestHeaders } }), request, slug);
    }

    return shopRewriteResponse(request, url, slug, pathname, requestHeaders);
  } catch (err) {
    console.error("[vendix] middleware failure", err);
    // Bot product hosts + login surfaces should stay reachable even if session/KV path throws
    const botHost =
      isSecurityHost(host, root) ||
      isTicketHost(host, root) ||
      isVerifyHost(host, root) ||
      isManageHost(host, root);
    if (botHost) {
      return securityHeaders(NextResponse.next());
    }
    if (
      pathname === "/platform-admin/login" ||
      pathname === "/admin/login" ||
      pathname.startsWith("/api/auth/")
    ) {
      return securityHeaders(NextResponse.next());
    }
    if (pathname.startsWith("/api/")) {
      return securityHeaders(
        NextResponse.json({ error: "Service unavailable" }, { status: 503 }),
      );
    }
    if (isShopAdminPath(pathname) || pathname.startsWith("/platform-admin")) {
      // Prefer login recovery over a dead 503 wall
      const loginPath = pathname.startsWith("/platform-admin")
        ? "/platform-admin/login"
        : "/admin/login";
      try {
        return redirectResponse(request, loginPath, slug);
      } catch {
        return securityHeaders(NextResponse.redirect(new URL(loginPath, url), 307));
      }
    }
    if (slug && !pathname.startsWith("/api/")) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-orel-shop", slug);
      return shopRewriteResponse(request, url, slug, pathname, requestHeaders);
    }
    return securityHeaders(NextResponse.next());
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
