import { NextResponse } from "next/server";
import { createShopUserOAuthState } from "@/lib/discord/user-oauth";
import { buildMicrosoftAuthorizeUrl, microsoftEnv, microsoftRedirectUri } from "@/lib/microsoft-oauth";
import { findShopBySlug, getShopSettings, initStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  await initStore();
  const url = new URL(request.url);
  const shopSlug = url.searchParams.get("shop")?.trim().toLowerCase() ?? "";
  const returnPath = url.searchParams.get("next")?.trim() || undefined;

  const shop = shopSlug ? findShopBySlug(shopSlug) : null;
  if (!shop) return NextResponse.json({ error: "상점을 찾을 수 없어요." }, { status: 404 });
  if (getShopSettings(shop.id).loginMicrosoftEnabled === false) {
    return NextResponse.json({ error: "이 상점은 Microsoft 로그인을 쓰지 않아요." }, { status: 403 });
  }

  const env = microsoftEnv();
  if (!env.configured) {
    return NextResponse.json({ error: "Microsoft 로그인이 아직 설정되지 않았어요." }, { status: 503 });
  }

  const safeReturn = returnPath && returnPath.startsWith("/") && !returnPath.startsWith("//") ? returnPath : undefined;
  const state = createShopUserOAuthState({ shopSlug: shop.slug, ...(safeReturn ? { returnPath: safeReturn } : {}) });
  return NextResponse.redirect(
    buildMicrosoftAuthorizeUrl({ clientId: env.clientId, redirectUri: microsoftRedirectUri(shop.slug), state }),
    302,
  );
}
