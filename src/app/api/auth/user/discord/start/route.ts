import { NextResponse } from "next/server";
import {
  buildShopUserDiscordAuthorizeUrl,
  createShopUserOAuthState,
  getShopUserDiscordRedirectUri,
} from "@/lib/discord/user-oauth";
import { doesDiscordEnvAsync, isMfaShopSlug } from "@/lib/discord/does-env";
import { discordEnvAsync } from "@/lib/discord/verify";
import { shopUrl } from "@/lib/domain";
import { getUserSession } from "@/lib/session-server";
import { findShopBySlug, getShopSettings, initStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  await initStore();
  const url = new URL(request.url);
  const shopSlug = url.searchParams.get("shop")?.trim().toLowerCase() ?? "";
  const returnPath = url.searchParams.get("next")?.trim() || undefined;

  if (!shopSlug) {
    return NextResponse.json({ error: "상점 정보가 없어요." }, { status: 400 });
  }

  const shop = findShopBySlug(shopSlug);
  if (!shop) {
    return NextResponse.json({ error: "상점을 찾을 수 없어요." }, { status: 404 });
  }

  const env = isMfaShopSlug(shop.slug) ? await doesDiscordEnvAsync() : await discordEnvAsync();
  if (!env.applicationId || !env.clientSecret) {
    return NextResponse.json(
      { error: "Discord 로그인이 아직 설정되지 않았어요." },
      { status: 503 },
    );
  }

  const safeReturn =
    returnPath && returnPath.startsWith("/") && !returnPath.startsWith("//")
      ? returnPath
      : undefined;

  let linkUserId: string | undefined;
  const discordLoginOn = getShopSettings(shop.id).loginDiscordEnabled !== false;
  if (url.searchParams.get("link") === "1") {
    const session = await getUserSession(shop.slug, request);
    if (session) linkUserId = session.user.id;
    else if (!discordLoginOn) return NextResponse.redirect(shopUrl(shop.slug, "/main"), 302);
  } else if (!discordLoginOn) {
    return NextResponse.json({ error: "이 상점은 Discord 로그인을 쓰지 않아요." }, { status: 403 });
  }

  const state = createShopUserOAuthState({
    shopSlug: shop.slug,
    ...(safeReturn ? { returnPath: safeReturn } : {}),
    ...(linkUserId ? { linkUserId } : {}),
  });
  const redirectUri = getShopUserDiscordRedirectUri(url.origin, shop.slug);
  const authorize = buildShopUserDiscordAuthorizeUrl({
    applicationId: env.applicationId,
    state,
    redirectUri,
    shopSlug: shop.slug,
  });
  return NextResponse.redirect(authorize, 302);
}
