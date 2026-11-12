import { NextResponse } from "next/server";
import { DISCORD_API } from "@/lib/discord/components";
import { doesDiscordEnvAsync } from "@/lib/discord/does-env";
import { discordEnvAsync } from "@/lib/discord/verify";
import { isMfaSiteHost } from "@/lib/domain";
import { panelOAuthRedirectUri } from "@/lib/discord/panel-oauth";
import { getShopUserDiscordRedirectUri } from "@/lib/discord/user-oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function probeClient(opts: {
  applicationId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const body = new URLSearchParams({
    client_id: opts.applicationId,
    client_secret: opts.clientSecret,
    grant_type: "authorization_code",
    code: "vendix_probe_invalid_code",
    redirect_uri: opts.redirectUri,
  });
  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => null)) as {
    error?: string;
    error_description?: string;
  } | null;
  const err = json?.error || "";
  // invalid_grant / invalid_request => client id+secret accepted
  // invalid_client => secret/app mismatch
  if (/invalid_client/i.test(err)) {
    return { ok: false as const, error: "invalid_client" as const };
  }
  return { ok: true as const, error: err || null };
}

export async function GET(request: Request) {
  const mfa = isMfaSiteHost(new URL(request.url).host);
  const shopSlug = mfa ? "mfa" : undefined;
  const env = mfa ? await doesDiscordEnvAsync() : await discordEnvAsync();
  if (!env.applicationId || !env.clientSecret) {
    return NextResponse.json({
      ok: false,
      configured: false,
      admin: false,
      user: false,
      error: "missing_secret",
      applicationId: env.applicationId || null,
      redirects: {
        admin: panelOAuthRedirectUri("shop", shopSlug),
        user: getShopUserDiscordRedirectUri(undefined, shopSlug),
      },
    });
  }

  const adminProbe = await probeClient({
    applicationId: env.applicationId,
    clientSecret: env.clientSecret,
    redirectUri: panelOAuthRedirectUri("shop", shopSlug),
  });
  const userProbe = await probeClient({
    applicationId: env.applicationId,
    clientSecret: env.clientSecret,
    redirectUri: getShopUserDiscordRedirectUri(undefined, shopSlug),
  });

  return NextResponse.json({
    ok: adminProbe.ok && userProbe.ok,
    configured: true,
    admin: adminProbe.ok,
    user: userProbe.ok,
    error: adminProbe.ok ? (userProbe.ok ? null : userProbe.error) : adminProbe.error,
    applicationId: env.applicationId,
    redirects: {
      admin: panelOAuthRedirectUri("shop", shopSlug),
      user: getShopUserDiscordRedirectUri(undefined, shopSlug),
    },
  });
}
