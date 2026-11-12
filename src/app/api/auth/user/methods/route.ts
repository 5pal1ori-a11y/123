import { NextResponse } from "next/server";
import { isShop, requireShop } from "@/lib/api";
import { doesDiscordEnvAsync, isMfaShopSlug } from "@/lib/discord/does-env";
import { discordEnvAsync } from "@/lib/discord/verify";
import { microsoftEnv } from "@/lib/microsoft-oauth";
import { getShopSettings, initStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 로그인 화면에 보일 버튼 — 관리자가 켰고 서버 설정(OAuth 키)도 있을 때만 true */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const settings = getShopSettings(shop.id);
  const discordEnv = isMfaShopSlug(shop.slug) ? await doesDiscordEnvAsync() : await discordEnvAsync();
  return NextResponse.json(
    {
      microsoft: settings.loginMicrosoftEnabled !== false && microsoftEnv().configured,
      discord: settings.loginDiscordEnabled !== false && Boolean(discordEnv.applicationId && discordEnv.clientSecret),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
