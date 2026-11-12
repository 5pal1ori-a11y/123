import { getOAuthRedirectOrigin } from "@/lib/domain";

export function buildAndroidDeepLink(input: {
  shopSlug: string;
  deviceKey: string;
  baseUrl?: string;
}) {
  const base = input.baseUrl ?? getOAuthRedirectOrigin();
  const params = new URLSearchParams({
    shop: input.shopSlug,
    key: input.deviceKey,
    base,
  });
  return `vendix://pair?${params.toString()}`;
}

/** Opens the installed APK via Android intent (works from mobile browser after install). */
export function buildAndroidIntentUrl(input: {
  shopSlug: string;
  deviceKey: string;
  baseUrl?: string;
}) {
  const base = input.baseUrl ?? getOAuthRedirectOrigin();
  const params = new URLSearchParams({
    shop: input.shopSlug,
    key: input.deviceKey,
    base,
  });
  return `intent://pair?${params.toString()}#Intent;scheme=vendix;package=com.vendix.autocharge;end`;
}
