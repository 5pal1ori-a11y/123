/**
 * 블랙리스트 — 사기 · 환불 악용 등 문제 유저를 차단한다.
 * 디스코드 ID 를 KV(discord-blacklist:v1:<shopId>)에 두고, 봇 명령·버튼을 막는다.
 * 연동된 사이트 계정이 있으면 사이트 이용제한(banned)도 같이 건다 → 구매·충전·로그인 차단.
 */
import { getStoreForRead, persistAsync } from "@/lib/store";
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";

type Entry = { reason: string; by: string; at: string };
type Db = Record<string, Entry>;
const key = (shopId: string) => `discord-blacklist:v1:${shopId}`;

export async function getBlacklist(shopId: string): Promise<Db> {
  return (await kvGetJson<Db>(key(shopId))) ?? {};
}

let cache: { shopId: string; at: number; ids: Set<string> } | null = null;
export async function isDiscordBlacklisted(shopId: string, discordId: string) {
  if (!discordId) return false;
  if (!cache || cache.shopId !== shopId || Date.now() - cache.at > 60_000) {
    cache = { shopId, at: Date.now(), ids: new Set(Object.keys(await getBlacklist(shopId))) };
  }
  return cache.ids.has(discordId);
}

/** 연동 사이트 계정에 이용제한을 함께 적용/해제 */
function setSiteBan(shopId: string, discordId: string, banned: boolean, reason: string) {
  const store = getStoreForRead();
  let changed = false;
  for (const u of store.users) {
    if (u.shopId !== shopId || u.discordId !== discordId) continue;
    u.banned = banned;
    u.banReason = banned ? reason || "이용이 제한된 계정이에요." : null;
    (u as { bannedAt?: string | null }).bannedAt = banned ? new Date().toISOString() : null;
    changed = true;
  }
  return changed;
}

export async function addBlacklist(shopId: string, discordId: string, reason: string, by: string) {
  return withLock(key(shopId), async () => {
    const db = await getBlacklist(shopId);
    db[discordId] = { reason: reason.slice(0, 200), by, at: new Date().toISOString() };
    await kvPutJson(key(shopId), db);
    cache = null;
    const banned = setSiteBan(shopId, discordId, true, reason);
    if (banned) await persistAsync();
    return { count: Object.keys(db).length, siteBanned: banned };
  });
}

export async function removeBlacklist(shopId: string, discordId: string) {
  return withLock(key(shopId), async () => {
    const db = await getBlacklist(shopId);
    const had = Boolean(db[discordId]);
    delete db[discordId];
    await kvPutJson(key(shopId), db);
    cache = null;
    const unbanned = setSiteBan(shopId, discordId, false, "");
    if (unbanned) await persistAsync();
    return { had, count: Object.keys(db).length };
  });
}
