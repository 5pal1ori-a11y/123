import { MFA_SHOP_SLUG, verifyShopAdmin } from "@/lib/store";
import { verifyDiscordEnvAsync } from "@/lib/verify-bot/env";
import {
  getVerifyGuild,
  listAllVerifyGuilds,
  persistVerifyStore,
  registerVerifyGuild,
  updateVerifyGuild,
} from "@/lib/verify-bot/store";

export function mfaVerifyGuildIdFromEnv() {
  return process.env.MFA_VERIFY_GUILD_ID?.trim() || "";
}

export function assertMfaShopAdmin(username: string, password: string) {
  return verifyShopAdmin(MFA_SHOP_SLUG, username, password);
}

export async function botInviteUrl() {
  const env = await verifyDiscordEnvAsync();
  if (!env.applicationId) return null;
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", env.applicationId);
  url.searchParams.set("permissions", "268438531");
  url.searchParams.set("scope", "bot applications.commands");
  return url.toString();
}

export async function fetchGuildName(guildId: string) {
  const env = await verifyDiscordEnvAsync();
  if (!env.botToken) return null;
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
      headers: { authorization: `Bot ${env.botToken}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { name?: string };
    return data.name?.trim() || null;
  } catch {
    return null;
  }
}

export function listMfaVerifyGuilds() {
  const locked = mfaVerifyGuildIdFromEnv();
  const all = listAllVerifyGuilds();
  if (locked) return all.filter((g) => g.guildId === locked);
  return all.filter((g) => g.registeredBy === "mfa-admin" || all.length === 1);
}

export async function ensureMfaVerifyGuild(guildId: string, guildName?: string) {
  const locked = mfaVerifyGuildIdFromEnv();
  if (locked && locked !== guildId) {
    throw new Error("이 인증봇은 지정된 Discord 서버에서만 사용할 수 있어요.");
  }
  const name = guildName?.trim() || (await fetchGuildName(guildId)) || `서버-${guildId.slice(-4)}`;
  const { guild, created } = registerVerifyGuild({
    guildId,
    guildName: name,
    registeredBy: "mfa-admin",
  });
  updateVerifyGuild(guildId, {
    planTier: "pro_max",
    logIp: true,
    logBlockedAttempts: true,
    panelTitle: guild.panelTitle === "서버 인증" || created ? "MFA MARKET 인증" : guild.panelTitle,
    panelDescription:
      created || guild.panelDescription.includes("아래 버튼을 눌러 Discord")
        ? "Discord 계정으로 인증하면 역할이 부여됩니다. 접속 IP가 기록됩니다."
        : guild.panelDescription,
  });
  await persistVerifyStore();
  return getVerifyGuild(guildId)!;
}
