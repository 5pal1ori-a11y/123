/** Server-safe shop URL helpers (no "use client"). */

import { shopUrl } from "@/lib/domain";

export function shopPath(base: string, path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!base) return p;
  if (p === "/") return base;
  return `${base}${p}`;
}

/** Relative dashboard path (use on shop subdomain). */
export function shopDashboardPath(_slug: string, tab?: string) {
  if (!tab || tab === "main") return "/dashboard";
  return `/dashboard?tab=${tab}`;
}

/** Absolute shop URL for links from the platform site. */
export function shopDashboardUrl(slug: string, tab?: string) {
  return shopUrl(slug, shopDashboardPath(slug, tab));
}
