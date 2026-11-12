import { NextResponse } from "next/server";
import {
  buildLinkedRoleAuthorizeUrl,
  createLinkedRoleState,
  ensureRoleConnectionMetadata,
  getLinkedRoleRedirectUri,
} from "@/lib/discord/linked-role";
import { discordEnvAsync } from "@/lib/discord/verify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Discord Developer Portal → Linked Roles Verification URL
 * https://vendix.team/linked-role
 */
export async function GET(request: Request) {
  const env = await discordEnvAsync();
  if (!env.applicationId) {
    return NextResponse.redirect(new URL("/linked-role/done?error=config", request.url), 302);
  }

  // Best-effort: keep Discord role metadata definitions in sync
  void ensureRoleConnectionMetadata().catch(() => null);

  const state = createLinkedRoleState();
  const redirectUri = getLinkedRoleRedirectUri(new URL(request.url).origin);
  const authorize = buildLinkedRoleAuthorizeUrl({
    applicationId: env.applicationId,
    state,
    redirectUri,
  });

  const res = NextResponse.redirect(authorize, 302);
  res.cookies.set("vendix_lr_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
