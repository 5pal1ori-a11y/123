import { NextResponse } from "next/server";
import {
  PANEL_OAUTH_COOKIE,
  panelOAuthCookieOptions,
  verifyShopAdminClaimTicket,
} from "@/lib/discord/panel-oauth";
import { establishAdminSession } from "@/lib/session-login";
import { getShopById, initStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  // Force KV reload — callback may have written owner on another colo.
  await initStore({ force: true });
  const url = new URL(request.url);
  const ticket = url.searchParams.get("t")?.trim() ?? "";
  const claim = verifyShopAdminClaimTicket(ticket);
  if (!claim) {
    return NextResponse.redirect(new URL("/admin/login?discord=claim", request.url), 303);
  }

  const shop = getShopById(claim.shopId);
  if (!shop || shop.slug !== claim.shopSlug) {
    return NextResponse.redirect(new URL("/admin/login?discord=shop", request.url), 303);
  }

  // Relative redirect keeps host + scheme (avoids http/https shopUrl edge cases).
  const res = NextResponse.redirect(new URL("/admin", request.url), 303);
  await establishAdminSession(request, shop, `discord:${claim.discordUserId}`, res);
  res.cookies.set(PANEL_OAUTH_COOKIE, "", { ...panelOAuthCookieOptions(0), maxAge: 0 });
  return res;
}
