import { makeBotOAuthCallbackHandler } from "@/lib/discord/bot-panel-oauth-routes";
import { registerVerifyGuildCommands } from "@/lib/verify-bot/rest";
import {
  createVerifyAdminToken,
  verifyAdminCookieName,
  verifyAdminCookieOptions,
} from "@/lib/verify-bot/session";
import { initVerifyStore, persistVerifyStore, registerVerifyGuild } from "@/lib/verify-bot/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = makeBotOAuthCallbackHandler("verify", {
  createToken: createVerifyAdminToken,
  cookieName: verifyAdminCookieName,
  cookieOptions: verifyAdminCookieOptions,
  onInvite: async ({ guildId, discordUserId, guildNameHint }) => {
    await initVerifyStore();
    const { password, recoveryKey } = registerVerifyGuild({
      guildId,
      guildName: guildNameHint || `서버-${guildId.slice(-4)}`,
      registeredBy: discordUserId,
    });
    await persistVerifyStore();
    await registerVerifyGuildCommands(guildId).catch(() => null);
    return { password, recoveryKey };
  },
});
