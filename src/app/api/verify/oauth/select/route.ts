import { makeBotOAuthSelectHandler } from "@/lib/discord/bot-panel-oauth-routes";
import {
  createVerifyAdminToken,
  verifyAdminCookieName,
  verifyAdminCookieOptions,
} from "@/lib/verify-bot/session";
import { getVerifyGuild, initVerifyStore } from "@/lib/verify-bot/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const select = makeBotOAuthSelectHandler("verify", {
  getGuild: (guildId) => getVerifyGuild(guildId),
  createToken: createVerifyAdminToken,
  cookieName: verifyAdminCookieName,
  cookieOptions: verifyAdminCookieOptions,
});

export async function POST(request: Request) {
  await initVerifyStore();
  return select(request);
}
