import { makeBotOAuthCallbackHandler } from "@/lib/discord/bot-panel-oauth-routes";
import { registerManageGuildCommands } from "@/lib/manage-bot/rest";
import {
  createManageAdminToken,
  manageAdminCookieName,
  manageAdminCookieOptions,
} from "@/lib/manage-bot/session";
import { initManageStore, persistManageStore, registerManageGuild } from "@/lib/manage-bot/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = makeBotOAuthCallbackHandler("manage", {
  createToken: createManageAdminToken,
  cookieName: manageAdminCookieName,
  cookieOptions: manageAdminCookieOptions,
  onInvite: async ({ guildId, discordUserId, guildNameHint }) => {
    await initManageStore();
    const { password } = registerManageGuild({
      guildId,
      guildName: guildNameHint || `서버-${guildId.slice(-4)}`,
      registeredBy: discordUserId,
    });
    await persistManageStore();
    await registerManageGuildCommands(guildId).catch(() => null);
    return { password };
  },
});
