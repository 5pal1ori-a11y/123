export function getRootDomain() {
  return process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "vendix.team";
}

/** 전용 도메인으로 운영하는 상점 (host → slug). 이 도메인들은 wrangler routes 에도 있어야 한다. */
const CUSTOM_SHOP_HOSTS: Record<string, string> = {
  "doesmc.xyz": "mfa",
  "www.doesmc.xyz": "mfa",
};

const CUSTOM_SHOP_PRIMARY: Record<string, string> = {
  mfa: "doesmc.xyz",
};

export function customShopSlug(host: string): string | null {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  return CUSTOM_SHOP_HOSTS[hostname] ?? null;
}

export function customShopDomain(slug: string): string | null {
  return CUSTOM_SHOP_PRIMARY[slug.toLowerCase()] ?? null;
}

export function shopHost(slug: string, port?: string) {
  const custom = customShopDomain(slug);
  if (custom) return custom;
  const root = getRootDomain();
  const host = `${slug}.${root}`;
  if (port && root === "localhost") return `${host}:${port}`;
  return host;
}

function shopOrigin(slug: string, port = "3000") {
  const root = getRootDomain();
  const custom = customShopDomain(slug);
  if (custom && root !== "localhost") return `https://${custom}`;
  if (root === "localhost") {
    return `http://${slug}.localhost:${port}`;
  }
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
  return `${protocol}://${slug}.${root}`;
}

export function shopUrl(slug: string, path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const suffix = normalized === "/" ? "" : normalized;

  if (typeof window !== "undefined") {
    const { protocol, port } = window.location;
    const root = getRootDomain();
    const custom = customShopDomain(slug);
    if (custom && root !== "localhost" && !window.location.hostname.endsWith(".localhost")) {
      return `https://${custom}${suffix}`;
    }
    const portSuffix =
      root === "localhost" || window.location.hostname.endsWith(".localhost")
        ? port
          ? `:${port}`
          : ""
        : "";
    if (root === "localhost" || window.location.hostname.endsWith(".localhost")) {
      return `${protocol}//${slug}.localhost${portSuffix}${suffix}`;
    }
    return `${protocol}//${slug}.${root}${suffix}`;
  }

  return `${shopOrigin(slug)}${suffix}`;
}

/** Extract shop slug from hostname like shop.vendix.team or shop.localhost */
export function slugFromHost(host: string, rootDomain = getRootDomain()): string | null {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  const root = rootDomain.toLowerCase();

  const custom = CUSTOM_SHOP_HOSTS[hostname];
  if (custom) return custom;

  if (hostname === root || hostname === `www.${root}`) return null;
  if (hostname === "localhost" || hostname === "127.0.0.1") return null;

  if (hostname.endsWith(`.${root}`)) {
    const sub = hostname.slice(0, -(root.length + 1));
    if (!sub || sub === "www" || sub === "verify" || sub === "ticket" || sub === "security" || sub === "manage" || sub.includes(".")) return null;
    return sub;
  }

  if (hostname.endsWith(".localhost")) {
    const sub = hostname.slice(0, -".localhost".length);
    if (!sub || sub === "verify" || sub === "ticket" || sub === "security" || sub === "manage" || sub.includes(".")) return null;
    return sub;
  }

  return null;
}

export function isValidShopSlug(slug: string) {
  return /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(slug);
}

/** Single OAuth callback origin — avoids registering every shop subdomain in Google Console */
export function getOAuthRedirectOrigin(fallbackOrigin?: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (appUrl) return appUrl;
  return fallbackOrigin ?? "http://localhost:3000";
}

export const MFA_SITE_HOST = "doesmc.xyz";
export const MFA_VERIFY_HOST = "verify.doesmc.xyz";
export const MFA_SITE_ORIGIN = "https://doesmc.xyz";
export const MFA_VERIFY_PANEL_ORIGIN = "https://doesmc.xyz/verify";

export function isMfaSiteHost(host: string): boolean {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  return hostname === MFA_SITE_HOST || hostname === `www.${MFA_SITE_HOST}` || hostname === MFA_VERIFY_HOST;
}

export function isMfaVerifyHost(host: string): boolean {
  return isMfaSiteHost(host);
}

/** verify.vendix.team / verify.localhost / verify.doesmc.xyz */
export function isVerifyHost(host: string, rootDomain = getRootDomain()): boolean {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  const root = rootDomain.toLowerCase();
  return hostname === `verify.${root}` || hostname === "verify.localhost" || hostname === MFA_VERIFY_HOST;
}

export function verifyOrigin(port = "3000") {
  const root = getRootDomain();
  if (root === "localhost") return `http://verify.localhost:${port}`;
  return MFA_VERIFY_PANEL_ORIGIN;
}

export function verifyOAuthStartOrigin() {
  const root = getRootDomain();
  if (root === "localhost") return `http://localhost:3000`;
  return MFA_SITE_ORIGIN;
}

export function verifyPanelUrl(guildId: string, path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const suffix = normalized === "/" ? "" : normalized;
  return `${verifyOrigin()}/${guildId}${suffix}`;
}

/** ticket.vendix.team (or ticket.localhost) */
export function isTicketHost(host: string, rootDomain = getRootDomain()): boolean {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  const root = rootDomain.toLowerCase();
  return hostname === `ticket.${root}` || hostname === "ticket.localhost";
}

export function ticketOrigin(port = "3000") {
  const root = getRootDomain();
  if (root === "localhost") return `http://ticket.localhost:${port}`;
  return `https://ticket.${root}`;
}

export function ticketPanelUrl(guildId: string, path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const suffix = normalized === "/" ? "" : normalized;
  return `${ticketOrigin()}/${guildId}${suffix}`;
}

export function ticketTranscriptUrl(
  guildId: string,
  usernameSlug: string,
  index: number,
  accessToken?: string,
) {
  const path = `${guildId}/${encodeURIComponent(usernameSlug)}/${index}`;
  const base = getRootDomain() === "localhost" ? `${ticketOrigin()}/${path}` : `${MFA_SITE_ORIGIN}/ticket/${path}`;
  if (!accessToken) return base;
  return `${base}?t=${encodeURIComponent(accessToken)}`;
}

/** security.vendix.team (or security.localhost) */
export function isSecurityHost(host: string, rootDomain = getRootDomain()): boolean {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  const root = rootDomain.toLowerCase();
  return hostname === `security.${root}` || hostname === "security.localhost";
}

export function securityOrigin(port = "3000") {
  const root = getRootDomain();
  if (root === "localhost") return `http://security.localhost:${port}`;
  return `https://security.${root}`;
}

export function securityPanelUrl(guildId: string, path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const suffix = normalized === "/" ? "" : normalized;
  return `${securityOrigin()}/${guildId}${suffix}`;
}

/** manage.vendix.team (or manage.localhost) */
export function isManageHost(host: string, rootDomain = getRootDomain()): boolean {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  const root = rootDomain.toLowerCase();
  return hostname === `manage.${root}` || hostname === "manage.localhost";
}

export function manageOrigin(port = "3000") {
  const root = getRootDomain();
  if (root === "localhost") return `http://manage.localhost:${port}`;
  return `https://manage.${root}`;
}

export function managePanelUrl(guildId: string, path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const suffix = normalized === "/" ? "" : normalized;
  return `${manageOrigin()}/${guildId}${suffix}`;
}
