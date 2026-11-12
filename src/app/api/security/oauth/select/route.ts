import { makeBotOAuthSelectHandler } from "@/lib/discord/bot-panel-oauth-routes";
import {
  createSecurityAdminToken,
  securityAdminCookieName,
  securityAdminCookieOptions,
} from "@/lib/security-bot/session";
import { getSecurityGuild, refreshSecurityStore } from "@/lib/security-bot/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const select = makeBotOAuthSelectHandler("security", {
  getGuild: (guildId) => getSecurityGuild(guildId),
  createToken: createSecurityAdminToken,
  cookieName: securityAdminCookieName,
  cookieOptions: securityAdminCookieOptions,
});

export async function POST(request: Request) {
  await refreshSecurityStore();
  return select(request);
}
