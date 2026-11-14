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
import { createShopUserClaimTicket } from "@/lib/discord/user-oauth";
import { findShopBySlug, getShopSettings, getUserByDiscordId, initStore } from "@/lib/store";

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
    if (!ownerId || ownerId !== session.discordUserId) {
      // 소유자가 아니어도, 이 디스코드로 가입한 부관리자(스태프) 회원이면 회원 로그인으로 처리해서 관리자 화면으로 보낸다
      const staff = getUserByDiscordId(shop.id, session.discordUserId);
      if (staff?.isSubAdmin && !staff.banned) {
        const ticket = createShopUserClaimTicket({
          shopId: shop.id,
          shopSlug: shop.slug,
          userId: staff.id,
          discordId: session.discordUserId,
          discordUsername: staff.discordUsername || session.discordUsername || "",
          avatar: staff.avatar,
        });
        return NextResponse.redirect(
          `${shopUrl(shop.slug, "/api/auth/user/discord/claim")}?t=${encodeURIComponent(ticket)}&next=${encodeURIComponent("/admin")}`,
          303,
        );
      }
      return fail(
        "forbidden",
        "소유자 또는 스태프로 등록된 Discord 계정만 로그인할 수 있어요. 먼저 상점에 이 Discord 로 로그인한 뒤 부관리자로 지정돼야 해요.",
      );
    }
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
