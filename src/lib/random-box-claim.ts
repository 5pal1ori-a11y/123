import { postRandomBoxLog } from "@/lib/discord/logs";
import { claimRandomBox, getTodayRandomBoxClaim, kstDayKey, persistAsync } from "@/lib/store";
import type { ShopUser } from "@/lib/types";
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";

export type RandomBoxMarker = { amount: number; jackpot: boolean; dayKey: string };

/** 전체 상점 JSON과 별개로 남기는 하루 1회 기록 — 다른 인스턴스가 옛 데이터를 저장해도 지워지지 않음 */
export function randomBoxMarkerKey(shopId: string, user: Pick<ShopUser, "id" | "discordId">) {
  const who = user.discordId ? `d:${user.discordId}` : `u:${user.id}`;
  return `rbox:${shopId}:${who}:${kstDayKey()}`;
}

export async function getRandomBoxResultToday(shopId: string, user: ShopUser) {
  const existing = getTodayRandomBoxClaim(shopId, user.id);
  if (existing) return { amount: existing.amount, jackpot: existing.jackpot, dayKey: existing.dayKey };
  return kvGetJson<RandomBoxMarker>(randomBoxMarkerKey(shopId, user));
}

export type RandomBoxOpenResult =
  | { ok: true; already: boolean; amount: number; jackpot: boolean; balance: number; dayKey: string }
  | { ok: false; error: string };

/** 웹 · 디스코드 공통 — 하루 한 번만 열린다 */
export function openRandomBoxOnce(shopId: string, user: ShopUser): Promise<RandomBoxOpenResult> {
  const key = randomBoxMarkerKey(shopId, user);
  return withLock(key, async () => {
    const marker = await kvGetJson<RandomBoxMarker>(key);
    if (marker && !getTodayRandomBoxClaim(shopId, user.id)) {
      return { ok: true, already: true, ...marker, balance: user.points };
    }

    const result = claimRandomBox(shopId, user.id);
    if (!result.ok) return result;
    await persistAsync();

    if (!result.already) {
      await kvPutJson(key, { amount: result.amount, jackpot: result.jackpot, dayKey: result.dayKey }, 2 * 86_400);
      postRandomBoxLog(shopId, {
        mention: user.discordId ? `<@${user.discordId}>` : user.name,
        name: user.discordUsername || user.name,
        amount: result.amount,
        jackpot: result.jackpot,
        already: false,
      });
    }
    return result;
  });
}
