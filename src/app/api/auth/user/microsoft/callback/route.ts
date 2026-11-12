import { NextResponse } from "next/server";
import { verifyShopUserOAuthState } from "@/lib/discord/user-oauth";
import { shopUrl } from "@/lib/domain";
import { exchangeMicrosoftCode, microsoftEnv, microsoftRedirectUri } from "@/lib/microsoft-oauth";
import { establishUserSession } from "@/lib/session-login";
import { findShopBySlug, getShopSettings, initStore, persistAsync, upsertMicrosoftUser } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fail(shopSlug: string | undefined, reason: string, message?: string) {
  if (!shopSlug) {
    const app = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://vendix.team";
    return NextResponse.redirect(`${app}/?microsoft=${encodeURIComponent(reason)}`, 302);
  }
  const url = new URL(`${shopUrl(shopSlug)}/`);
  url.searchParams.set("microsoft", reason);
  if (message) url.searchParams.set("msg", message.slice(0, 120));
  return NextResponse.redirect(url.toString(), 302);
}

export async function GET(request: Request) {
  await initStore({ force: true });
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  const payload = verifyShopUserOAuthState(url.searchParams.get("state")?.trim() ?? "");
  if (url.searchParams.get("error")) return fail(payload?.shopSlug, "denied");
  if (!payload) return fail(undefined, "state");
  if (!code) return fail(payload.shopSlug, "code");

  const shop = findShopBySlug(payload.shopSlug);
  if (!shop) return fail(payload.shopSlug, "shop");

  const env = microsoftEnv();
  if (!env.configured) return fail(shop.slug, "config");

  const profile = await exchangeMicrosoftCode({
    code,
    redirectUri: microsoftRedirectUri(shop.slug),
    clientId: env.clientId,
    clientSecret: env.clientSecret,
  });
  if ("error" in profile) return fail(shop.slug, "error");

  const settings = getShopSettings(shop.id);
  const result = upsertMicrosoftUser({
    shopId: shop.id,
    microsoftId: profile.id,
    name: profile.name,
    email: profile.email,
    minecraft: profile.minecraft,
    acceptedTermsVersion: settings.termsVersion,
    acceptedPrivacyVersion: settings.privacyVersion,
  });
  if (!result.ok) return fail(shop.slug, "error", result.error);
  await persistAsync();

  const next =
    payload.returnPath && payload.returnPath.startsWith("/") && !payload.returnPath.startsWith("//")
      ? payload.returnPath
      : "/dashboard";
  const res = NextResponse.redirect(shopUrl(shop.slug, next), 303);
  await establishUserSession(request, shop, result.user.id, res);
  return res;
}
