import { NextResponse } from "next/server";
import {
  buildDiscordAccountLinkUrl,
  getDiscordOAuthRedirectUri,
} from "@/lib/discord/invite";
import { discordEnvAsync } from "@/lib/discord/verify";

export const dynamic = "force-dynamic";

/** Public: exact redirect_uri + client_id the app sends to Discord (no secrets). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const env = await discordEnvAsync();
  const redirectUri = getDiscordOAuthRedirectUri(url.origin);

  const authorizeUrl = env.applicationId
    ? buildDiscordAccountLinkUrl({
        applicationId: env.applicationId,
        state: "preview",
        redirectUri,
      })
    : null;

  return NextResponse.json({
    redirectUri,
    clientId: env.applicationId || null,
    hasClientSecret: Boolean(env.clientSecret),
    authorizeUrl,
    portalSteps: [
      "https://discord.com/developers/applications 열기",
      `Application ID가 ${env.applicationId || "(없음)"} 인 앱 선택`,
      "OAuth2 → Redirects → Add Redirect",
      redirectUri,
      "Save Changes 필수",
    ],
  });
}
