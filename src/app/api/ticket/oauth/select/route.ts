import { makeBotOAuthSelectHandler } from "@/lib/discord/bot-panel-oauth-routes";
import {
  createTicketAdminToken,
  ticketAdminCookieName,
  ticketAdminCookieOptions,
} from "@/lib/ticket-bot/session";
import { getTicketGuild, initTicketStore } from "@/lib/ticket-bot/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const select = makeBotOAuthSelectHandler("ticket", {
  getGuild: (guildId) => getTicketGuild(guildId),
  createToken: createTicketAdminToken,
  cookieName: ticketAdminCookieName,
  cookieOptions: ticketAdminCookieOptions,
});

export async function POST(request: Request) {
  await initTicketStore();
  return select(request);
}
