import { NextResponse } from "next/server";
import { registerGuildCommands, VENDIX_DISCORD_COMMANDS } from "@/lib/discord/rest";
import {
  exchangeDiscordOAuthCode,
  fetchDiscordOAuthUser,
  formatDiscordUsername,
  getDiscordOAuthRedirectUri,
  verifyDiscordSetupToken,
} from "@/lib/discord/invite";
import { discordEnvAsync } from "@/lib/discord/verify";
import { shopUrl } from "@/lib/domain";
import { planMeetsMinimum } from "@/lib/plans";
import {
  findShopBySlug,
  getShopById,
  initStore,
  persistAsync,
  updateShopSettings,
} from "@/lib/store";

function activateReturnUrl(
  slug: string,
  status: "ok" | "error",
  detail?: string,
  extras?: { discordUser?: string },
) {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://vendix.team";
  const url = new URL("/activate", base);
  url.searchParams.set("discord", status);
  url.searchParams.set("shop", slug);
  if (detail) url.searchParams.set("msg", detail.slice(0, 120));
  if (extras?.discordUser) url.searchParams.set("discord_user", extras.discordUser.slice(0, 64));
  return url.toString();
}

export async function GET(request: Request) {
  await initStore();
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.trim() ?? "";
  const code = url.searchParams.get("code")?.trim() ?? "";
  const guildId = url.searchParams.get("guild_id")?.trim() ?? "";
  const error = url.searchParams.get("error");

  const payload = verifyDiscordSetupToken(state);
  if (!payload) {
    return NextResponse.redirect(activateReturnUrl("unknown", "error", "연동 링크가 만료되었어요."), 302);
  }

  if (error) {
    return NextResponse.redirect(
      activateReturnUrl(payload.slug, "error", "Discord 연동이 취소되었어요."),
      302,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      activateReturnUrl(payload.slug, "error", "Discord 인증 코드가 없어요."),
      302,
    );
  }

  if (!guildId || !/^\d{5,30}$/.test(guildId)) {
    return NextResponse.redirect(
      activateReturnUrl(payload.slug, "error", "연동할 Discord 서버를 선택해 주세요."),
      302,
    );
  }

  const shop = getShopById(payload.shopId) ?? findShopBySlug(payload.slug);
  if (!shop || shop.id !== payload.shopId) {
    return NextResponse.redirect(
      activateReturnUrl(payload.slug, "error", "상점을 찾을 수 없어요."),
      302,
    );
  }

  const env = await discordEnvAsync();
  if (!env.applicationId || !env.clientSecret) {
    return NextResponse.redirect(
      activateReturnUrl(payload.slug, "error", "Discord 계정 연동 설정이 없어요."),
      302,
    );
  }

  const redirectUri = getDiscordOAuthRedirectUri(url.origin);
  const tokenResult = await exchangeDiscordOAuthCode({
    code,
    redirectUri,
    applicationId: env.applicationId,
    clientSecret: env.clientSecret,
  });
  if ("error" in tokenResult) {
    return NextResponse.redirect(activateReturnUrl(payload.slug, "error", tokenResult.error), 302);
  }

  const userResult = await fetchDiscordOAuthUser(tokenResult.accessToken);
  if ("error" in userResult) {
    return NextResponse.redirect(activateReturnUrl(payload.slug, "error", userResult.error), 302);
  }

  const displayName = formatDiscordUsername(userResult);

  updateShopSettings(shop.id, {
    discordBotEnabled: true,
    discordGuildId: guildId,
    discordOwnerId: userResult.id,
    discordOwnerUsername: displayName,
    discordOwnerAvatar: userResult.avatar,
  });
  await persistAsync();

  if (planMeetsMinimum(shop.plan, "pro")) {
    try {
      if (shop.slug === "mfa") {
        const { syncMfaDoesDiscord } = await import("@/lib/discord/sync-mfa-does");
        await syncMfaDoesDiscord(guildId);
      } else {
        await registerGuildCommands(guildId, [...VENDIX_DISCORD_COMMANDS], { shopId: shop.id });
      }
    } catch {
      // guild + account bind succeeded; commands can be registered later in admin
    }
  }

  const done = new URL("/activate", process.env.NEXT_PUBLIC_APP_URL || "https://vendix.team");
  done.searchParams.set("discord", "ok");
  done.searchParams.set("shop", shop.slug);
  done.searchParams.set("discord_user", displayName);
  done.searchParams.set("admin", shopUrl(shop.slug, "/admin/login"));
  done.searchParams.set("store", shopUrl(shop.slug));
  return NextResponse.redirect(done.toString(), 302);
}
