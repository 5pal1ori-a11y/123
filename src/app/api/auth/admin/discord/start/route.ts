import { NextResponse } from "next/server";
import {
  buildPanelOAuthAuthorizeUrl,
  createPanelOAuthState,
  panelOAuthCredentials,
  panelOAuthRedirectUri,
} from "@/lib/discord/panel-oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shopSlug = url.searchParams.get("shop")?.trim() || undefined;
  const creds = await panelOAuthCredentials("shop", shopSlug);
  if (!creds) {
    return NextResponse.json({ error: "Discord OAuth가 설정되지 않았어요." }, { status: 503 });
  }
  const state = createPanelOAuthState("shop", { shopSlug });
  const authorize = buildPanelOAuthAuthorizeUrl({
    applicationId: creds.applicationId,
    state,
    redirectUri: panelOAuthRedirectUri("shop", shopSlug),
  });
  return NextResponse.redirect(authorize, 302);
}
