import { NextResponse } from "next/server";
import { verifyShopUserClaimTicket } from "@/lib/discord/user-oauth";
import { shopUrl } from "@/lib/domain";
import { establishUserSession } from "@/lib/session-login";
import {
  getShopById,
  getShopSettings,
  getUserById,
  initStore,
  linkDiscordToUser,
  persistAsync,
  upsertDiscordUser,
} from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  // Force KV reload — Discord callback may have written the user on another colo.
  await initStore({ force: true });
  const url = new URL(request.url);
  const ticket = url.searchParams.get("t")?.trim() ?? "";
  const nextRaw = url.searchParams.get("next")?.trim() || "/dashboard";
  const next =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/dashboard";

  const claim = verifyShopUserClaimTicket(ticket);
  if (!claim) {
    return NextResponse.redirect(new URL("/?discord=claim", request.url), 303);
  }

  const shop = getShopById(claim.shopId);
  if (!shop || shop.slug !== claim.shopSlug) {
    return NextResponse.redirect(new URL("/?discord=shop", request.url), 303);
  }

  if (claim.linkFrom) {
    let linked = getUserById(claim.userId);
    if (!linked || linked.shopId !== shop.id || linked.discordId !== claim.discordId) {
      // 콜백이 쓴 내용이 아직 안 보이면 이 호스트에서 한 번 더 연동한다
      const again = linkDiscordToUser({
        shopId: shop.id,
        userId: claim.linkFrom,
        discordId: claim.discordId,
        discordUsername: claim.discordUsername,
        avatar: claim.avatar,
      });
      if (!again.ok) {
        const back = new URL(shopUrl(shop.slug, next));
        back.searchParams.set("discord", "link_error");
        back.searchParams.set("msg", again.error.slice(0, 120));
        return NextResponse.redirect(back.toString(), 303);
      }
      linked = again.user;
      await persistAsync();
    }
    if (linked.banned) {
      return NextResponse.redirect(
        `${shopUrl(shop.slug)}/?discord=error&msg=${encodeURIComponent("이용이 제한된 계정이에요.")}`,
        303,
      );
    }
    const done = new URL(shopUrl(shop.slug, next));
    done.searchParams.set("discord", linked.id === claim.linkFrom ? "linked" : "merged");
    const res = NextResponse.redirect(done.toString(), 303);
    await establishUserSession(request, shop, linked.id, res);
    return res;
  }

  const settings = getShopSettings(shop.id);
  // Upsert again on shop host so KV lag cannot drop the new Discord user.
  const upserted = upsertDiscordUser({
    shopId: shop.id,
    discordId: claim.discordId,
    discordUsername: claim.discordUsername,
    email: claim.email,
    avatar: claim.avatar,
    acceptedTermsVersion: settings.termsVersion,
    acceptedPrivacyVersion: settings.privacyVersion,
  });
  if (!upserted.ok) {
    return NextResponse.redirect(
      `${shopUrl(shop.slug)}/?discord=error&msg=${encodeURIComponent(upserted.error.slice(0, 80))}`,
      303,
    );
  }

  let user = upserted.user;
  // Prefer ticket userId when it matches the same Discord account
  const byTicket = getUserById(claim.userId);
  if (byTicket && byTicket.shopId === shop.id && byTicket.discordId === claim.discordId) {
    user = byTicket;
  }

  if (user.banned) {
    return NextResponse.redirect(
      `${shopUrl(shop.slug)}/?discord=error&msg=${encodeURIComponent("이용이 제한된 계정이에요.")}`,
      303,
    );
  }

  await persistAsync();

  const res = NextResponse.redirect(shopUrl(shop.slug, next), 303);
  await establishUserSession(request, shop, user.id, res);
  return res;
}
