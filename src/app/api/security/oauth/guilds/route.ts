import { makeBotOAuthGuildsHandler } from "@/lib/discord/bot-panel-oauth-routes";
import { listSecurityGuilds, refreshSecurityStore } from "@/lib/security-bot/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = makeBotOAuthGuildsHandler("security", async () => {
  await refreshSecurityStore();
  return listSecurityGuilds().map((g) => ({ guildId: g.guildId, guildName: g.guildName }));
});
