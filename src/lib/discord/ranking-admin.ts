/**
 * /랭킹관리 — 구매 랭킹(vendix 집계판 · 이미지)과 DOES 리더보드(커뮤니티 봇 Top Clients)에서
 * 특정 사람을 빼거나 다시 넣는다. 운영자 본인처럼 순위에 안 보여야 할 사람용.
 */
import { container, errorPanel, plainEphemeral, textDisplay, v2Ephemeral } from "@/lib/discord/components";
import { doesForwardKey } from "@/lib/discord/does-forward";
import { isDiscordAdmin } from "@/lib/discord/handlers";
import { getShopBySlug, getShopSettings, MFA_DISCORD_GUILD_ID, persistAsync, updateShopSettings } from "@/lib/store";

const HIDDEN_URL = "https://discord-shop-bot.tyopal18.workers.dev/internal/hidden";

/** 커뮤니티 봇 리더보드에도 반영 — 실패해도 vendix 쪽 처리는 그대로 */
async function syncCommunity(guildId: string, userId: string | null, hidden: boolean) {
  const key = await doesForwardKey();
  if (!key) return null;
  const res = await fetch(HIDDEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-does-forward": key },
    body: JSON.stringify({ guildId, userId, hidden }),
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json().catch(() => null)) as { hidden?: string[] } | null;
}

export async function handleRankingAdmin(shopSlug: string, roles: string[], permissions: string | undefined, action: string, userId: string | null) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  const settings = getShopSettings(shop.id);
  if (!isDiscordAdmin(settings, roles, permissions)) return errorPanel("랭킹 관리는 관리자만 할 수 있어요.", "권한 없음");
  const guildId = settings.discordGuildId || MFA_DISCORD_GUILD_ID;
  const list = new Set(settings.rankingExcludedDiscordIds ?? []);

  if (action === "list") {
    const community = await syncCommunity(guildId, null, false);
    const all = new Set([...list, ...(community?.hidden ?? [])]);
    return v2Ephemeral([
      container([
        textDisplay("## 랭킹에서 빠진 사람"),
        textDisplay(all.size ? [...all].map((id) => `· <@${id}>${list.has(id) ? "" : " (리더보드만)"}`).join("\n") : "빠진 사람이 없어요."),
        textDisplay("-# `/랭킹관리 동작:복구 유저:@사람` 으로 다시 넣을 수 있어요"),
      ]),
    ]);
  }

  if (!userId || !/^\d{15,22}$/.test(userId)) return plainEphemeral("`유저` 옵션으로 대상을 골라 주세요.");
  const hide = action === "hide";
  if (hide) list.add(userId);
  else list.delete(userId);
  updateShopSettings(shop.id, { rankingExcludedDiscordIds: [...list] });
  await persistAsync();

  // 구매 랭킹 집계판 · DOES 리더보드 다시 그리기
  const [board, community] = await Promise.all([
    import("@/lib/discord/leaderboard-board").then((m) => m.refreshLeaderboardBoard(shop.id)).catch(() => null),
    syncCommunity(guildId, userId, hide),
    import("@/lib/discord/does-leaderboard").then((m) => m.pushDoesLeaderboard(shop.id)).catch(() => null),
  ]);

  return v2Ephemeral([
    container(
      [
        textDisplay(hide ? `## <@${userId}> 님을 랭킹에서 뺐어요` : `## <@${userId}> 님을 랭킹에 다시 넣었어요`),
        textDisplay(
          [
            `· 구매 랭킹 ${board?.ok ? "반영됨" : "다음 갱신 때 반영"}`,
            `· 리더보드 ${community ? "반영됨" : "반영 실패 — 잠시 뒤 다시 시도해 주세요"}`,
          ].join("\n"),
        ),
        textDisplay("-# 구매 기록은 그대로고, 순위에만 안 보여요"),
      ],
      hide ? 0x64748b : 0x22c55e,
    ),
  ]);
}
