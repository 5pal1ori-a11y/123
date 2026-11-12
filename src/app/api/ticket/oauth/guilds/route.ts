import { makeBotOAuthGuildsHandler } from "@/lib/discord/bot-panel-oauth-routes";
import { initTicketStore, listTicketGuilds } from "@/lib/ticket-bot/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = makeBotOAuthGuildsHandler("ticket", async () => {
  await initTicketStore();
  return listTicketGuilds().map((g) => ({ guildId: g.guildId, guildName: g.guildName }));
});
