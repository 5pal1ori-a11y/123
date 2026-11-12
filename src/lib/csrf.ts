import { NextResponse } from "next/server";
import { getRootDomain } from "@/lib/domain";
import { isProduction } from "@/lib/security";

/** Block cross-origin / cross-subdomain state-changing requests (CSRF). */
export function assertSameOrigin(request: Request): NextResponse | null {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
    return null;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    const site = request.headers.get("sec-fetch-site");
    // Same-origin browser navigations / fetches
    if (site === "same-origin") return null;
    // Dev tools / curl without Origin — allow only outside production
    if ((!site || site === "none") && !isProduction()) return null;
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  try {
    const reqHost = new URL(request.url).hostname.toLowerCase();
    const originHost = new URL(origin).hostname.toLowerCase();
    if (originHost === reqHost) return null;
    // 개발 서버는 request.url 을 localhost 로 바꿔 버리므로 브라우저가 보낸 Host 도 확인한다
    const hostHeader = (request.headers.get("host") ?? "").trim();
    if (hostHeader && originHost === hostHeader.replace(/:\d+$/, "").toLowerCase()) return null;

    const root = getRootDomain().toLowerCase();
    if (root !== "localhost" && (originHost === root || originHost.endsWith(`.${root}`))) {
      if (originHost !== reqHost) {
        return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
      }
    }
  } catch {
    return NextResponse.json({ error: "Invalid Origin" }, { status: 403 });
  }

  return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
}
