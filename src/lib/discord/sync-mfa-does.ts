import { createHash } from "crypto";
import { DOES_BOT_COMMANDS } from "@/lib/discord/commands-list";
import { DOES_APPLICATION_ID, DOES_PUBLIC_KEY } from "@/lib/discord/does-env";
import { DOES_COMMUNITY_COMMANDS } from "@/lib/discord/does-community-commands";
import { registerGuildCommands, VENDIX_DISCORD_COMMANDS } from "@/lib/discord/rest";
import { DISCORD_API } from "@/lib/discord/components";
import {
  MFA_DISCORD_GUILD_ID,
  MFA_SHOP_SLUG,
  getDiscordCredentials,
  getShopBySlug,
  initStore,
  persistAsync,
  updateShopSettings,
} from "@/lib/store";
import { initVerifyStore } from "@/lib/verify-bot/store";
import { ensureMfaVerifyGuild } from "@/lib/verify-bot/mfa";
import { VERIFY_DISCORD_COMMANDS } from "@/lib/verify-bot/commands";
import { kvGetJson, kvPutJson } from "@/lib/world/kv";

/** DOES 봇 서버에 올라가는 슬래시 명령 전체 */
export function doesCommandSet() {
  return [...VENDIX_DISCORD_COMMANDS, ...DOES_BOT_COMMANDS, ...VERIFY_DISCORD_COMMANDS, ...DOES_COMMUNITY_COMMANDS];
}

const HASH_KEY = "does:cmd-hash";

/** 명령 정의가 마지막 등록 때와 다를 때만 다시 등록한다 (cron·첫 상호작용에서 호출) */
export async function syncDoesCommandsIfChanged() {
  const hash = createHash("sha256").update(JSON.stringify(doesCommandSet())).digest("hex").slice(0, 24);
  if ((await kvGetJson<string>(HASH_KEY)) === hash) return { ok: true as const, skipped: true };
  await Promise.all([initStore(), initVerifyStore()]);
  const result = await syncMfaDoesDiscord();
  if (result.ok) await kvPutJson(HASH_KEY, hash);
  return { ...result, skipped: false };
}

let checkedThisIsolate = false;

export function syncDoesCommandsOnce() {
  if (checkedThisIsolate) return null;
  checkedThisIsolate = true;
  return syncDoesCommandsIfChanged().catch((err) => {
    checkedThisIsolate = false;
    console.log("does command sync failed", String(err));
  });
}

export async function syncMfaDoesDiscord(guildId = MFA_DISCORD_GUILD_ID) {
  const shop = getShopBySlug(MFA_SHOP_SLUG);
  if (!shop) return { ok: false as const, error: "MFA 상점이 없어요." };

  updateShopSettings(shop.id, {
    discordGuildId: guildId,
    discordBotEnabled: true,
    discordApplicationId: DOES_APPLICATION_ID,
    discordPublicKey: DOES_PUBLIC_KEY,
  });
  await ensureMfaVerifyGuild(guildId, "DOES");
  await persistAsync();

  const doesMerged = doesCommandSet();

  const [doesReg, vendixClear] = await Promise.all([
    registerGuildCommands(guildId, doesMerged, { shopId: shop.id }),
    registerGuildCommands(guildId, []),
  ]);

  // 디스코드가 돌려준 실제 등록 목록 요약 (크론 로그로 확인용 — 이름만, 비밀값 없음)
  const registered = doesReg.ok && Array.isArray(doesReg.commands) ? (doesReg.commands as { name?: string }[]) : [];
  // DOES 봇이 들어가 있는 서버 목록 (이름·ID만) — 명령이 다른 서버에 올라가 있지 않은지 확인용
  let botGuilds: { id: string; name: string }[] = [];
  try {
    const token = getDiscordCredentials(shop.id).botToken;
    if (token) {
      const res = await fetch(`${DISCORD_API}/users/@me/guilds`, { headers: { Authorization: `Bot ${token}` } });
      if (res.ok) botGuilds = ((await res.json()) as { id: string; name: string }[]).map((g) => ({ id: g.id, name: g.name }));
    }
  } catch {
    /* 진단용 */
  }
  return {
    ok: doesReg.ok,
    error: doesReg.ok ? undefined : doesReg.error,
    does: doesReg.ok ? "ok" : doesReg.error,
    vendix: vendixClear.ok ? "cleared" : vendixClear.error,
    guildId,
    botGuilds,
    sent: doesMerged.length,
    registered: registered.length,
    has: {
      서버상황: registered.some((c) => c.name === "서버상황"),
      추천인: registered.some((c) => c.name === "추천인"),
      출석: registered.some((c) => c.name === "출석"),
    },
  };
}
