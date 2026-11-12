import { NextResponse } from "next/server";
import {
  exchangeDiscordOAuthCode,
  fetchDiscordOAuthUser,
  formatDiscordUsername,
} from "@/lib/discord/invite";
import {
  createShopUserClaimTicket,
  discordAvatarUrl,
  getShopUserDiscordRedirectUri,
  verifyShopUserOAuthState,
} from "@/lib/discord/user-oauth";
import { doesDiscordEnvAsync, isMfaShopSlug } from "@/lib/discord/does-env";
import { discordEnvAsync } from "@/lib/discord/verify";
import { shopUrl } from "@/lib/domain";
import {
  MFA_DISCORD_GUILD_ID,
  findShopBySlug,
  getShopSettings,
  initStore,
  linkDiscordToUser,
  persistAsync,
  upsertDiscordUser,
} from "@/lib/store";
import { completeGuildVerification } from "@/lib/verify-bot/complete-verify";
import { ensureMfaVerifyGuild, mfaVerifyGuildIdFromEnv } from "@/lib/verify-bot/mfa";
import { fetchVerifyOAuthUser } from "@/lib/verify-bot/oauth";
import { getVerifyGuild, initVerifyStore } from "@/lib/verify-bot/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function failRedirect(shopSlug: string | undefined, reason: string, message?: string) {
  if (shopSlug) {
    const url = new URL(`${shopUrl(shopSlug)}/`);
    url.searchParams.set("discord", reason);
    if (message) url.searchParams.set("msg", message.slice(0, 120));
    return NextResponse.redirect(url.toString(), 302);
  }
  const app = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://vendix.team";
  return NextResponse.redirect(`${app}/?discord=${encodeURIComponent(reason)}`, 302);
}

async function verifyOnShopLogin(opts: {
  request: Request;
  accessToken: string;
  refreshToken: string | null;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  await initVerifyStore();
  const guildId = mfaVerifyGuildIdFromEnv() || MFA_DISCORD_GUILD_ID;
  if (!guildId) return { ok: true };
  const guild = getVerifyGuild(guildId) ?? (await ensureMfaVerifyGuild(guildId));
  if (!guild.enabled) return { ok: true };

  const user = await fetchVerifyOAuthUser(opts.accessToken);
  if ("error" in user) {
    console.error("[shop-login-verify] user fetch failed", user.error);
    return { ok: true };
  }

  const result = await completeGuildVerification({
    request: opts.request,
    guild,
    accessToken: opts.accessToken,
    refreshToken: opts.refreshToken,
    user,
    source: "shop-login",
  });
  if (!result.ok && result.blockLogin) {
    return { ok: false, reason: result.reason };
  }
  return { ok: true };
}

export async function GET(request: Request) {
  await initStore();
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";
  const error = url.searchParams.get("error");

  const payload = verifyShopUserOAuthState(state);
  if (error) return failRedirect(payload?.shopSlug, "denied");
  if (!payload) return failRedirect(undefined, "state");
  if (!code) return failRedirect(payload.shopSlug, "code");

  const shop = findShopBySlug(payload.shopSlug);
  if (!shop) return failRedirect(payload.shopSlug, "shop");

  const env = isMfaShopSlug(payload.shopSlug)
    ? await doesDiscordEnvAsync()
    : await discordEnvAsync();
  if (!env.applicationId || !env.clientSecret) {
    return failRedirect(payload.shopSlug, "config");
  }

  const redirectUri = getShopUserDiscordRedirectUri(url.origin, payload.shopSlug);
  const tokenResult = await exchangeDiscordOAuthCode({
    code,
    redirectUri,
    applicationId: env.applicationId,
    clientSecret: env.clientSecret,
  });
  if ("error" in tokenResult) {
    return failRedirect(payload.shopSlug, "error");
  }

  const userResult = await fetchDiscordOAuthUser(tokenResult.accessToken);
  if ("error" in userResult) {
    return failRedirect(payload.shopSlug, "error");
  }

  if (isMfaShopSlug(payload.shopSlug)) {
    const verified = await verifyOnShopLogin({
      request,
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken,
    });
    if (!verified.ok) {
      return failRedirect(payload.shopSlug, verified.reason);
    }
  }

  const settings = getShopSettings(shop.id);
  const verifiedEmail = userResult.emailVerified ? userResult.email : null;
  const displayName = formatDiscordUsername(userResult);
  const avatar = discordAvatarUrl(userResult.id, userResult.avatar);
  const next =
    payload.returnPath && payload.returnPath.startsWith("/") && !payload.returnPath.startsWith("//")
      ? payload.returnPath
      : "/dashboard";

  if (payload.linkUserId) {
    const linked = linkDiscordToUser({
      shopId: shop.id,
      userId: payload.linkUserId,
      discordId: userResult.id,
      discordUsername: displayName,
      avatar,
    });
    if (!linked.ok) {
      const back = new URL(shopUrl(shop.slug, next));
      back.searchParams.set("discord", "link_error");
      back.searchParams.set("msg", linked.error.slice(0, 120));
      return NextResponse.redirect(back.toString(), 302);
    }
    await persistAsync();
    const ticket = createShopUserClaimTicket({
      shopId: shop.id,
      shopSlug: shop.slug,
      userId: linked.user.id,
      discordId: userResult.id,
      discordUsername: displayName,
      avatar,
      linkFrom: payload.linkUserId,
    });
    const claimUrl = new URL(shopUrl(shop.slug, "/api/auth/user/discord/claim"));
    claimUrl.searchParams.set("t", ticket);
    claimUrl.searchParams.set("next", next);
    return NextResponse.redirect(claimUrl.toString(), 303);
  }

  if (settings.loginDiscordEnabled === false) return failRedirect(shop.slug, "disabled");

  const result = upsertDiscordUser({
    shopId: shop.id,
    discordId: userResult.id,
    discordUsername: displayName,
    email: verifiedEmail,
    avatar,
    acceptedTermsVersion: settings.termsVersion,
    acceptedPrivacyVersion: settings.privacyVersion,
  });
  if (!result.ok) {
    return NextResponse.redirect(
      `${shopUrl(shop.slug)}/?discord=error&msg=${encodeURIComponent(result.error.slice(0, 80))}`,
      302,
    );
  }

  await persistAsync();

  const ticket = createShopUserClaimTicket({
    shopId: shop.id,
    shopSlug: shop.slug,
    userId: result.user.id,
    discordId: userResult.id,
    discordUsername: displayName,
    email: verifiedEmail,
    avatar,
  });
  const claimUrl = new URL(shopUrl(shop.slug, "/api/auth/user/discord/claim"));
  claimUrl.searchParams.set("t", ticket);
  claimUrl.searchParams.set("next", next);
  return NextResponse.redirect(claimUrl.toString(), 303);
}
