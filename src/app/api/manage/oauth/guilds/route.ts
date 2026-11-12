import { makeBotOAuthGuildsHandler } from "@/lib/discord/bot-panel-oauth-routes";
import { initManageStore, listAllManageGuilds } from "@/lib/manage-bot/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = makeBotOAuthGuildsHandler("manage", async () => {
  await initManageStore();
  return listAllManageGuilds().map((g) => ({ guildId: g.guildId, guildName: g.guildName }));
});
