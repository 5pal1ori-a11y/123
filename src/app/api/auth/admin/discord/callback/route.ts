import { NextResponse } from "next/server";
import { isMfaShopSlug } from "@/lib/discord/does-env";
import {
  completePanelOAuth,
  createShopAdminClaimTicket,
  encodePanelOAuthSession,
  PANEL_OAUTH_COOKIE,
  panelOAuthCookieOptions,
  panelOAuthRedirectUri,
  verifyPanelOAuthState,
} from "@/lib/discord/panel-oauth";
import { shopUrl } from "@/lib/domain";
import { findShopBySlug, getShopSettings, initStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const app = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://vendix.team";
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";
  const error = url.searchParams.get("error");

  const payload = verifyPanelOAuthState(state);
  const returnShop = payload?.shopSlug;

  function fail(reason: string, detail?: string) {
    const q = new URLSearchParams({ discord: reason });
    if (detail) q.set("msg", detail.slice(0, 120));
    if (returnShop) {
      return NextResponse.redirect(
        `${shopUrl(returnShop, "/admin/login")}?${q.toString()}`,
        302,
      );
    }
    return NextResponse.redirect(`${app}/admin/discord?${q.toString()}`, 302);
  }

  if (error) return fail("denied");
  if (!payload || payload.product !== "shop") return fail("state");
  if (!code) return fail("code");

  const session = await completePanelOAuth({
    product: "shop",
    shopSlug: payload.shopSlug,
    code,
    redirectUri: panelOAuthRedirectUri("shop", payload.shopSlug),
  });
  if ("error" in session) {
    return fail("error", session.error);
  }

  await initStore({ force: true });

  if (isMfaShopSlug(returnShop) && returnShop) {
    const shop = findShopBySlug(returnShop);
    if (!shop) return fail("shop");
    const ownerId = getShopSettings(shop.id).discordOwnerId;
    if (!ownerId || ownerId !== session.discordUserId) return fail("forbidden", "상점 소유자 Discord 계정만 로그인할 수 있어요.");
    const ticket = createShopAdminClaimTicket({
      shopId: shop.id,
      shopSlug: shop.slug,
      discordUserId: session.discordUserId,
    });
    return NextResponse.redirect(
      `${shopUrl(shop.slug, "/api/auth/admin/discord/claim")}?t=${encodeURIComponent(ticket)}`,
      303,
    );
  }

  // Always land on guild picker — registered opens panel, unregistered registers with license.
  const slim = {
    ...session,
    ownedGuilds: session.ownedGuilds.map((g) => ({
      id: g.id,
      name: g.name.slice(0, 48),
      icon: null as string | null,
      owner: g.owner === true,
    })),
  };

  const q = new URLSearchParams({ discord: "ok" });
  if (returnShop) q.set("shop", returnShop);
  const dest = `${app}/admin/discord?${q.toString()}`;
  const res = NextResponse.redirect(dest, 303);
  res.cookies.set(PANEL_OAUTH_COOKIE, encodePanelOAuthSession(slim), panelOAuthCookieOptions());
  return res;
}
