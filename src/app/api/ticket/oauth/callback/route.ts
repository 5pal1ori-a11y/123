import { makeBotOAuthCallbackHandler } from "@/lib/discord/bot-panel-oauth-routes";
import { registerTicketGuildCommands } from "@/lib/ticket-bot/rest";
import {
  createTicketAdminToken,
  ticketAdminCookieName,
  ticketAdminCookieOptions,
} from "@/lib/ticket-bot/session";
import { initTicketStore, persistTicketStore, registerTicketGuild } from "@/lib/ticket-bot/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = makeBotOAuthCallbackHandler("ticket", {
  createToken: createTicketAdminToken,
  cookieName: ticketAdminCookieName,
  cookieOptions: ticketAdminCookieOptions,
  onInvite: async ({ guildId, discordUserId, guildNameHint }) => {
    await initTicketStore();
    const { password } = registerTicketGuild({
      guildId,
      guildName: guildNameHint || `서버-${guildId.slice(-4)}`,
      registeredBy: discordUserId,
    });
    await persistTicketStore();
    await registerTicketGuildCommands(guildId).catch(() => null);
    return { password };
  },
});
