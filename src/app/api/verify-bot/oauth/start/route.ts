import { NextResponse } from "next/server";
import { verifyOrigin } from "@/lib/domain";
import { verifyHasFeature } from "@/lib/verify-bot/plan";
import {
  buildVerifyAuthorizeUrl,
  createVerifyOAuthState,
  verifyOAuthState,
} from "@/lib/verify-bot/oauth";
import { getVerifyGuild, initVerifyStore } from "@/lib/verify-bot/store";
import { turnstileSiteKey } from "@/lib/verify-bot/turnstile-public";
import { verifyTurnstileToken } from "@/lib/verify-bot/turnstile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function done(q: string) {
  return NextResponse.redirect(`${verifyOrigin()}/done?${q}`, 302);
}

export async function GET(request: Request) {
  await initVerifyStore();
  const url = new URL(request.url);
  const guildId = url.searchParams.get("guild")?.trim() ?? "";
  let state = url.searchParams.get("state")?.trim() ?? "";
  const turnstileToken =
    url.searchParams.get("cf-turnstile-response")?.trim() ||
    url.searchParams.get("turnstile")?.trim() ||
    "";

  if (!guildId || !/^\d{5,30}$/.test(guildId)) {
    return done("error=guild");
  }

  const guild = getVerifyGuild(guildId);
  if (!guild || !guild.enabled) {
    return done("error=disabled");
  }

  const parsedState = state ? verifyOAuthState(state) : null;
  if (!parsedState || parsedState.guildId !== guildId) {
    state = createVerifyOAuthState(guildId);
  }

  const needCaptcha =
    guild.enableTurnstile && verifyHasFeature(guild.planTier, "turnstile");

  if (needCaptcha) {
    if (!turnstileToken) {
      if (!turnstileSiteKey()) {
        return done("error=captcha");
      }
      const gate = new URL(`${verifyOrigin()}/captcha`);
      gate.searchParams.set("guild", guildId);
      gate.searchParams.set("state", state);
      return NextResponse.redirect(gate.toString(), 302);
    }
    const ip =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const check = await verifyTurnstileToken({
      token: turnstileToken,
      ip,
      expectedAction: "verify_oauth",
    });
    if (!check.ok) return done("error=captcha");
  }

  try {
    const parsed = verifyOAuthState(state);
    const authorize = await buildVerifyAuthorizeUrl({
      guildId,
      state,
      includeEmail: guild.logEmail || guild.requireEmail || guild.requirePhoneLinked,
    });
    const res = NextResponse.redirect(authorize, 302);
    res.cookies.set("vendix_vb_oauth", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    // stash source meta for callback (also in state)
    if (parsed?.channelId) {
      res.cookies.set("vendix_vb_ch", parsed.channelId, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      });
    }
    return res;
  } catch (err) {
    console.error("[verify-oauth] start failed", err);
    return done("error=config");
  }
}
