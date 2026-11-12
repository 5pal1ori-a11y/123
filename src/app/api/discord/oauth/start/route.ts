import { NextResponse } from "next/server";
import {
  buildDiscordAccountLinkUrl,
  getDiscordOAuthRedirectUri,
  verifyDiscordSetupToken,
} from "@/lib/discord/invite";
import { discordEnvAsync } from "@/lib/discord/verify";
import { initStore } from "@/lib/store";

export async function GET(request: Request) {
  await initStore();
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "연동 토큰이 없어요." }, { status: 400 });
  }

  const payload = verifyDiscordSetupToken(token);
  if (!payload) {
    return NextResponse.json({ error: "연동 링크가 만료되었어요. 상점을 다시 등록해 주세요." }, { status: 400 });
  }

  const env = await discordEnvAsync();
  if (!env.applicationId || !env.clientSecret) {
    return NextResponse.json(
      { error: "Discord 계정 연동이 아직 설정되지 않았어요. 관리자에게 문의해 주세요." },
      { status: 503 },
    );
  }

  const redirectUri = getDiscordOAuthRedirectUri(url.origin);
  const authorize = buildDiscordAccountLinkUrl({
    applicationId: env.applicationId,
    state: token,
    redirectUri,
  });

  return NextResponse.redirect(authorize, 302);
}
