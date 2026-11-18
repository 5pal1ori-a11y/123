/**
 * 서버 태그(길드 태그/클랜 태그) 로깅 — 1시간마다 서버 인원을 훑어
 * 우리 서버 태그를 착용한 사람(user.primary_guild.identity_guild_id === 우리 길드)을 기록한다.
 * 기록은 KV(server-tag:v1:<shopId>)에 두고, 태그 전용 이벤트 참여 자격 확인에 쓴다.
 */
import { doesDiscordEnvAsync } from "@/lib/discord/does-env";
import { getShopById, getShopSettings, MFA_DISCORD_GUILD_ID } from "@/lib/store";
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";

type PrimaryGuild = { identity_guild_id?: string | null; identity_enabled?: boolean | null; tag?: string | null };
type GwMember = { user?: { id?: string; primary_guild?: PrimaryGuild | null; bot?: boolean } };

export type ServerTagDb = {
  guildId: string;
  tag: string | null;
  updatedAt: string | null;
  /** 태그 착용자: discordId → { since, lastSeen } */
  wearers: Record<string, { since: string; lastSeen: string }>;
  total: number;
  scanned: number;
};

const key = (shopId: string) => `server-tag:v1:${shopId}`;
const RUN_EVERY_MS = 60 * 60_000;

export async function getServerTagDb(shopId: string): Promise<ServerTagDb> {
  const guildId = getShopSettings(shopId).discordGuildId || MFA_DISCORD_GUILD_ID;
  return (await kvGetJson<ServerTagDb>(key(shopId))) ?? { guildId, tag: null, updatedAt: null, wearers: {}, total: 0, scanned: 0 };
}

export function isTagWearer(db: ServerTagDb, discordId: string) {
  return Boolean(db.wearers[discordId]);
}

/** 한 명의 현재 태그 착용 여부를 실시간 확인 (스캔이 오래됐을 때 보완용) */
export async function liveTagCheck(shopId: string, discordId: string): Promise<boolean | null> {
  const token = (await doesDiscordEnvAsync()).botToken;
  if (!token) return null;
  const guildId = getShopSettings(shopId).discordGuildId || MFA_DISCORD_GUILD_ID;
  const r = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`, { headers: { Authorization: `Bot ${token}` } }).catch(() => null);
  if (!r?.ok) return null;
  const m = (await r.json().catch(() => null)) as GwMember | null;
  const pg = m?.user?.primary_guild;
  return Boolean(pg?.identity_enabled && pg.identity_guild_id === guildId);
}

/** 1시간마다 전체 인원 스캔 (force 면 주기 무시) */
export async function scanServerTag(shopId: string, force = false) {
  const token = (await doesDiscordEnvAsync()).botToken;
  if (!token) return { skipped: true as const, reason: "no token" };
  const guildId = getShopSettings(shopId).discordGuildId || MFA_DISCORD_GUILD_ID;
  return withLock(key(shopId), async () => {
    const db = await getServerTagDb(shopId);
    if (!force && db.updatedAt && Date.now() - new Date(db.updatedAt).getTime() < RUN_EVERY_MS - 60_000) return { skipped: true as const };
    const now = new Date().toISOString();
    const wearers: ServerTagDb["wearers"] = {};
    let tag: string | null = null;
    let scanned = 0;
    let after = "0";
    // 멤버 목록 페이지네이션 (Server Members Intent 필요)
    for (let page = 0; page < 40; page++) {
      const r = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members?limit=1000&after=${after}`, { headers: { Authorization: `Bot ${token}` } }).catch(() => null);
      if (!r?.ok) break;
      const list = (await r.json().catch(() => [])) as GwMember[];
      if (!list.length) break;
      for (const m of list) {
        const id = m.user?.id;
        if (!id || m.user?.bot) continue;
        scanned++;
        const pg = m.user?.primary_guild;
        if (pg?.identity_enabled && pg.identity_guild_id === guildId) {
          wearers[id] = { since: db.wearers[id]?.since ?? now, lastSeen: now };
          if (pg.tag) tag = pg.tag;
        }
      }
      after = list[list.length - 1]?.user?.id ?? after;
      if (list.length < 1000) break;
    }
    const next: ServerTagDb = { guildId, tag: tag ?? db.tag, updatedAt: now, wearers, total: Object.keys(wearers).length, scanned };
    await kvPutJson(key(shopId), next);
    return { skipped: false as const, total: next.total, scanned, tag: next.tag };
  });
}
