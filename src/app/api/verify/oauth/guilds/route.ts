import { makeBotOAuthGuildsHandler } from "@/lib/discord/bot-panel-oauth-routes";
import { initVerifyStore, listAllVerifyGuilds } from "@/lib/verify-bot/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = makeBotOAuthGuildsHandler("verify", async () => {
  await initVerifyStore();
  return listAllVerifyGuilds().map((g) => ({ guildId: g.guildId, guildName: g.guildName }));
});
