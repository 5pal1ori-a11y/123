import { NextResponse } from "next/server";
import {
  computeLinkedRoleMetadata,
  ensureRoleConnectionMetadata,
  getLinkedRoleRedirectUri,
  pushUserRoleConnection,
  verifyLinkedRoleState,
} from "@/lib/discord/linked-role";
import {
  exchangeDiscordOAuthCode,
  fetchDiscordOAuthUser,
  formatDiscordUsername,
} from "@/lib/discord/invite";
import { discordEnvAsync } from "@/lib/discord/verify";
import { initStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function doneUrl(request: Request, params: Record<string, string>) {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://vendix.team";
  const url = new URL("/linked-role/done", base);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v.slice(0, 80));
  }
  return url.toString();
}

export async function GET(request: Request) {
  await initStore();
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";
  const error = url.searchParams.get("error");

  const cookieStateRaw = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("vendix_lr_state="))
    ?.slice("vendix_lr_state=".length);
  const cookieState = cookieStateRaw ? decodeURIComponent(cookieStateRaw) : undefined;

  const clearCookie = (res: NextResponse) => {
    res.cookies.set("vendix_lr_state", "", { httpOnly: true, path: "/", maxAge: 0 });
    return res;
  };

  if (error) {
    return clearCookie(
      NextResponse.redirect(doneUrl(request, { error: "denied" }), 302),
    );
  }

  if (!code || !state || !cookieState || cookieState !== state || !verifyLinkedRoleState(state)) {
    return clearCookie(
      NextResponse.redirect(doneUrl(request, { error: "state" }), 302),
    );
  }

  const env = await discordEnvAsync();
  if (!env.applicationId || !env.clientSecret) {
    return clearCookie(
      NextResponse.redirect(doneUrl(request, { error: "config" }), 302),
    );
  }

  const redirectUri = getLinkedRoleRedirectUri(url.origin);
  const tokenResult = await exchangeDiscordOAuthCode({
    code,
    redirectUri,
    applicationId: env.applicationId,
    clientSecret: env.clientSecret,
  });
  if ("error" in tokenResult) {
    return clearCookie(
      NextResponse.redirect(doneUrl(request, { error: "token" }), 302),
    );
  }

  const userResult = await fetchDiscordOAuthUser(tokenResult.accessToken);
  if ("error" in userResult) {
    return clearCookie(
      NextResponse.redirect(doneUrl(request, { error: "user" }), 302),
    );
  }

  void ensureRoleConnectionMetadata().catch(() => null);

  const metadata = computeLinkedRoleMetadata(userResult.id);
  const pushed = await pushUserRoleConnection({
    accessToken: tokenResult.accessToken,
    applicationId: env.applicationId,
    platformName: "DOES",
    metadata,
  });

  if (!pushed.ok) {
    return clearCookie(
      NextResponse.redirect(doneUrl(request, { error: "push" }), 302),
    );
  }

  return clearCookie(
    NextResponse.redirect(
      doneUrl(request, {
        ok: "1",
        user: formatDiscordUsername(userResult),
        linked: String(metadata.shop_linked),
      }),
      302,
    ),
  );
}
