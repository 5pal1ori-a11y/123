import { addGuildMemberRole } from "@/lib/discord/dm";
import { getShopSettings, getStoreForRead, getUserById, userLifetimeSpend } from "@/lib/store";

export async function grantSpendRolesForUser(shopId: string, userId: string) {
  const settings = getShopSettings(shopId);
  const rules = settings.spendRoles ?? [];
  if (!rules.length || !settings.discordGuildId) return;
  const user = getUserById(userId);
  if (!user?.discordId || user.shopId !== shopId) return;
  const spent = userLifetimeSpend(shopId, userId);
  for (const rule of rules) {
    if (spent >= rule.minAmount && rule.roleId) {
      await addGuildMemberRole(settings.discordGuildId, user.discordId, rule.roleId, shopId);
    }
  }
}

/** 누적 충전액이 닿은 모든 등급의 역할 + 수동 지정 등급 역할 */
export async function grantTierRolesForUser(shopId: string, userId: string) {
  const settings = getShopSettings(shopId);
  if (!settings.discordGuildId) return;
  const user = getUserById(userId);
  if (!user?.discordId || user.shopId !== shopId) return;
  const tiers = getStoreForRead().tiers.filter((t) => t.shopId === shopId && t.discordRoleId);
  for (const tier of tiers) {
    if (user.totalCharged >= tier.minTotalCharged || user.tierId === tier.id) {
      await addGuildMemberRole(settings.discordGuildId, user.discordId, tier.discordRoleId!, shopId);
    }
  }
}

/** 역할이 새로 설정된 등급을 이미 달성한 유저들에게 소급 지급 */
export async function backfillTierRole(shopId: string, tierId: string, limit = 300) {
  const settings = getShopSettings(shopId);
  if (!settings.discordGuildId) return 0;
  const store = getStoreForRead();
  const tier = store.tiers.find((t) => t.id === tierId && t.shopId === shopId);
  if (!tier?.discordRoleId) return 0;
  const users = store.users
    .filter(
      (u) =>
        u.shopId === shopId &&
        u.discordId &&
        (u.totalCharged >= tier.minTotalCharged || u.tierId === tier.id),
    )
    .slice(0, limit);
  for (const u of users) {
    await addGuildMemberRole(settings.discordGuildId, u.discordId!, tier.discordRoleId, shopId).catch(() => null);
  }
  return users.length;
}
