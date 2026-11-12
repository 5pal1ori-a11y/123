import { NextResponse } from "next/server";
import { verifyOrigin } from "@/lib/domain";
import { completeGuildVerification } from "@/lib/verify-bot/complete-verify";
import {
  exchangeVerifyOAuthCode,
  fetchVerifyOAuthUser,
  verifyOAuthState,
} from "@/lib/verify-bot/oauth";
import { getVerifyGuild, initVerifyStore } from "@/lib/verify-bot/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function done(pathQuery: string) {
  return NextResponse.redirect(`${verifyOrigin()}/done?${pathQuery}`, 302);
}

export async function GET(request: Request) {
  await initVerifyStore();
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";
  const error = url.searchParams.get("error");

  const cookieRaw = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("vendix_vb_oauth="))
    ?.slice("vendix_vb_oauth=".length);
  const cookieState = cookieRaw ? decodeURIComponent(cookieRaw) : "";

  const clear = (res: NextResponse) => {
    res.cookies.set("vendix_vb_oauth", "", { httpOnly: true, path: "/", maxAge: 0 });
    return res;
  };

  if (error) return clear(done("error=denied"));
  if (!code || !state || !cookieState || cookieState !== state) {
    return clear(done("error=state"));
  }

  const parsed = verifyOAuthState(state);
  if (!parsed) return clear(done("error=state"));

  const guild = getVerifyGuild(parsed.guildId);
  if (!guild || !guild.enabled) return clear(done("error=disabled"));

  const tokenResult = await exchangeVerifyOAuthCode(code);
  if ("error" in tokenResult) return clear(done("error=token"));

  const userResult = await fetchVerifyOAuthUser(tokenResult.accessToken);
  if ("error" in userResult) return clear(done("error=user"));

  const result = await completeGuildVerification({
    request,
    guild,
    accessToken: tokenResult.accessToken,
    refreshToken: tokenResult.refreshToken,
    user: userResult,
    source: "oauth",
    channelId: parsed.channelId,
    campaign: parsed.campaign,
  });

  if (!result.ok) return clear(done(`error=${result.reason}`));
  return clear(
    done(
      `ok=1&guild=${encodeURIComponent(guild.guildId)}&user=${encodeURIComponent(userResult.username)}`,
    ),
  );
}
