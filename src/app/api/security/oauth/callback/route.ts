import { makeBotOAuthCallbackHandler } from "@/lib/discord/bot-panel-oauth-routes";
import { fetchDiscordGuild, registerSecurityGuildCommands, syncSecurityAutoMod } from "@/lib/security-bot/rest";
import {
  createSecurityAdminToken,
  securityAdminCookieName,
  securityAdminCookieOptions,
} from "@/lib/security-bot/session";
import {
  persistSecurityStore,
  refreshSecurityStore,
  registerSecurityGuild,
} from "@/lib/security-bot/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = makeBotOAuthCallbackHandler("security", {
  createToken: createSecurityAdminToken,
  cookieName: securityAdminCookieName,
  cookieOptions: securityAdminCookieOptions,
  onInvite: async ({ guildId, discordUserId, guildNameHint }) => {
    await refreshSecurityStore();
    const fetched = await fetchDiscordGuild(guildId);
    const guildName = fetched?.name || guildNameHint || `서버-${guildId.slice(-4)}`;
    const { guild, password } = registerSecurityGuild({
      guildId,
      guildName,
      registeredBy: discordUserId,
    });
    await persistSecurityStore();
    await registerSecurityGuildCommands(guildId).catch(() => null);
    await syncSecurityAutoMod(guild).catch(() => null);
    return { password };
  },
});
