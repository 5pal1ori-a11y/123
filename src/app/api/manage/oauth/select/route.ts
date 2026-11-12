import { makeBotOAuthSelectHandler } from "@/lib/discord/bot-panel-oauth-routes";
import {
  createManageAdminToken,
  manageAdminCookieName,
  manageAdminCookieOptions,
} from "@/lib/manage-bot/session";
import { getManageGuild, initManageStore } from "@/lib/manage-bot/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const select = makeBotOAuthSelectHandler("manage", {
  getGuild: (guildId) => getManageGuild(guildId),
  createToken: createManageAdminToken,
  cookieName: manageAdminCookieName,
  cookieOptions: manageAdminCookieOptions,
});

export async function POST(request: Request) {
  await initManageStore();
  return select(request);
}
