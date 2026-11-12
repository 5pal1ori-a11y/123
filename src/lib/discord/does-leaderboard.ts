import { doesForwardKey } from "@/lib/discord/does-forward";
import { getShopBySlug, getShopSettings, getStoreForRead, MFA_DISCORD_GUILD_ID, MFA_SHOP_SLUG } from "@/lib/store";

const DOES_TOTALS_URL = "https://discord-shop-bot.tyopal18.workers.dev/internal/shop-totals";
const COUNTED = new Set(["dispensed", "paid", "awaiting_fulfillment"]);

/** 디스코드 ID 별 누적 구매금액 (원) */
export function doesPurchaseTotals(shopId: string) {
  const store = getStoreForRead();
  const discordOf = new Map<string, string>();
  for (const u of store.users) if (u.shopId === shopId && u.discordId) discordOf.set(u.id, u.discordId);
  const totals: Record<string, number> = {};
  for (const o of store.orders) {
    if (o.shopId !== shopId || !o.userId || !COUNTED.has(o.status)) continue;
    const discordId = discordOf.get(o.userId);
    if (!discordId) continue;
    totals[discordId] = (totals[discordId] ?? 0) + o.amount;
  }
  return totals;
}

/** DOES 디스코드 리더보드(Top Clients)에 상점 구매 합계를 보낸다. 봇은 값이 바뀌었을 때만 메시지를 고친다 */
export async function pushDoesLeaderboard(shopId?: string) {
  const shop = getShopBySlug(MFA_SHOP_SLUG);
  if (!shop || (shopId && shopId !== shop.id)) return { ok: false as const, skipped: true };
  const key = await doesForwardKey();
  if (!key) return { ok: false as const, error: "no key" };
  const guildId = getShopSettings(shop.id).discordGuildId || MFA_DISCORD_GUILD_ID;
  const res = await fetch(DOES_TOTALS_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-does-forward": key },
    body: JSON.stringify({ guildId, totals: doesPurchaseTotals(shop.id) }),
    signal: AbortSignal.timeout(8_000),
  });
  return { ok: res.ok, status: res.status };
}
