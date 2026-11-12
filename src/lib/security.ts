import { randomBytes } from "crypto";
import type { License, Order, Shop, ShopSettings } from "@/lib/types";

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

function maskSecret(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 4) return "••••";
  return `${"•".repeat(Math.min(12, value.length - 4))}${value.slice(-4)}`;
}

export function secretLast4(value: string | null | undefined) {
  if (!value || value.length < 4) return null;
  return value.slice(-4);
}

/** Device keys look like vnd_<hex> — must not live in the Pushbullet token field. */
export function looksLikeVendixDeviceKey(value: string | null | undefined) {
  return Boolean(value && /^vnd_[a-f0-9]{16,}$/i.test(value.trim()));
}

/** Strip plaintext third-party credentials before sending to the client. */
export function sanitizeShopSettings(settings: ShopSettings) {
  const pb = settings.pushbulletAccessToken;
  return {
    ...settings,
    culturelandPassword: settings.culturelandPassword ? maskSecret(settings.culturelandPassword) : null,
    nowpaymentsApiKey: settings.nowpaymentsApiKey ? maskSecret(settings.nowpaymentsApiKey) : null,
    nowpaymentsIpnSecret: settings.nowpaymentsIpnSecret ? maskSecret(settings.nowpaymentsIpnSecret) : null,
    pushbulletAccessToken: pb ? maskSecret(pb) : null,
    pushbulletTokenHint: secretLast4(pb),
    pushbulletLooksLikeDeviceKey: looksLikeVendixDeviceKey(pb),
    iosGenToken: settings.iosGenToken ? maskSecret(settings.iosGenToken) : null,
    iosGenTokenHint: secretLast4(settings.iosGenToken),
    discordBotToken: settings.discordBotToken ? maskSecret(settings.discordBotToken) : null,
    discordPublicKey: settings.discordPublicKey ? maskSecret(settings.discordPublicKey) : null,
    mfaApiKey: settings.mfaApiKey ? maskSecret(settings.mfaApiKey) : null,
  };
}

export function generateOrderAccessToken() {
  return randomBytes(24).toString("base64url");
}

export function maskLicenseKey(key: string | null | undefined) {
  if (!key) return null;
  if (key.length <= 12) return "••••••••";
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

export function sanitizeShop(shop: Shop) {
  const { adminPassword: _pw, adminPasswordHash: _hash, ...safe } = shop;
  return safe;
}

export function sanitizeOrder(order: Order, opts?: { includeCode?: boolean; includeToken?: boolean }) {
  const { accessToken, dispensedCode, ...rest } = order;
  return {
    ...rest,
    dispensedCode: opts?.includeCode ? dispensedCode : null,
    ...(opts?.includeToken && accessToken ? { accessToken } : {}),
  };
}

export function sanitizeLicense(license: License, opts?: { revealKey?: boolean }) {
  if (opts?.revealKey) return license;
  return { ...license, key: maskLicenseKey(license.key) };
}

export function assertSecureRuntimeConfig() {
  if (!isProduction()) return;

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret || authSecret === "vendix-dev-secret-change-me" || authSecret.length < 32) {
    throw new Error("AUTH_SECRET must be set to a random 32+ character value in production.");
  }

  const platformPassword = process.env.PLATFORM_ADMIN_PASSWORD?.trim();
  if (
    !platformPassword ||
    platformPassword.includes("change-me") ||
    platformPassword === "qwer1234" ||
    platformPassword.length < 8
  ) {
    throw new Error(
      "PLATFORM_ADMIN_PASSWORD must be set (8+, not default) via Cloudflare secrets in production.",
    );
  }
}
