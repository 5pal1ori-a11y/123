import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, isShop, isShopOwnerAdmin, requireShop, unauthorized } from "@/lib/api";
import { discordEnvAsync } from "@/lib/discord/verify";
import { listBotGuilds } from "@/lib/discord/list-bot-guilds";
import { filterTextChannels } from "@/lib/discord/logs";
import { listGuildTextChannels } from "@/lib/discord/rest";
import { syncMfaDoesDiscord } from "@/lib/discord/sync-mfa-does";
import {
  getDiscordCredentials,
  getShopSettings,
  initStore,
  MFA_DISCORD_GUILD_ID,
  MFA_SHOP_SLUG,
  persistAsync,
  updateShopSettings,
} from "@/lib/store";
import { initStoreKvOnly } from "@/lib/store-init";
import { listMfaVerifyGuilds } from "@/lib/verify-bot/mfa";
import { initVerifyStore } from "@/lib/verify-bot/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const saveSchema = z.object({
  action: z.enum(["save", "sync"]),
  shopGuildId: z.string().regex(/^\d{5,30}$/).nullable().optional(),
  verifyGuildId: z.string().regex(/^\d{5,30}$/).nullable().optional(),
});

const LOG_KEYS = [
  "discordPurchaseLogChannelId",
  "discordChargeLogChannelId",
  "discordAdminLogChannelId",
  "discordReviewLogChannelId",
  "discordRestockLogChannelId",
  "discordRandomBoxLogChannelId",
  "discordStockChannelId",
  "discordLeaderboardChannelId",
] as const;
type LogKey = (typeof LOG_KEYS)[number];

const channelId = z
  .string()
  .regex(/^\d{5,30}$/)
  .nullable()
  .optional();

const logsSchema = z.object({
  action: z.literal("logs"),
  logs: z.object(Object.fromEntries(LOG_KEYS.map((k) => [k, channelId])) as Record<LogKey, typeof channelId>),
});

async function guildChannels(shopId: string, guildId: string | null) {
  if (!guildId) return { channels: [], channelsError: "먼저 자판기 서버를 저장해 주세요." };
  const res = await listGuildTextChannels(guildId, shopId);
  if (!res.ok) {
    const message =
      typeof res.json === "object" && res.json && "message" in res.json
        ? String((res.json as { message?: string }).message)
        : `Discord API ${res.status}`;
    return { channels: [], channelsError: `채널 목록을 못 불러왔어요: ${message}` };
  }
  return { channels: filterTextChannels(res.json), channelsError: null };
}

async function boot() {
  try {
    await initStore();
  } catch {
    await initStoreKvOnly();
  }
  await initVerifyStore();
}

function requireMfaShop(request: Request) {
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (shop.slug !== MFA_SHOP_SLUG) {
    return NextResponse.json({ error: "MFA 상점 전용입니다." }, { status: 404 });
  }
  if (!isShopOwnerAdmin(request, shop)) return unauthorized();
  return shop;
}

async function payload(shopId: string) {
  const shopCreds = getDiscordCredentials(shopId);
  const platform = await discordEnvAsync();
  const token = shopCreds.botToken || platform.botToken;
  const applicationId = shopCreds.applicationId || platform.applicationId;
  const guilds = await listBotGuilds(token);
  const settings = getShopSettings(shopId);
  const verify = listMfaVerifyGuilds()[0] ?? null;
  const ready = Boolean(token && applicationId);
  const { channels, channelsError } = await guildChannels(shopId, settings.discordGuildId);
  return {
    channels,
    channelsError,
    logs: Object.fromEntries(LOG_KEYS.map((k) => [k, settings[k] ?? null])) as Record<LogKey, string | null>,
    ok: true as const,
    shopBotReady: ready,
    verifyBotReady: ready,
    shopGuilds: guilds,
    verifyGuilds: guilds,
    selected: {
      shopGuildId: settings.discordGuildId,
      verifyGuildId: verify?.guildId ?? null,
      shopGuildName: guilds.find((g) => g.id === settings.discordGuildId)?.name ?? null,
      verifyGuildName: verify?.guildName ?? guilds.find((g) => g.id === verify?.guildId)?.name ?? null,
    },
  };
}

export async function GET(request: Request) {
  await boot();
  const shop = requireMfaShop(request);
  if (!isShop(shop)) return shop;
  return NextResponse.json(await payload(shop.id));
}

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  await boot();
  const shop = requireMfaShop(request);
  if (!isShop(shop)) return shop;

  const body = await request.json().catch(() => null);
  const logs = logsSchema.safeParse(body);
  if (logs.success) {
    const settings = getShopSettings(shop.id);
    const patch: Parameters<typeof updateShopSettings>[1] = {};
    for (const key of LOG_KEYS) {
      const next = logs.data.logs[key];
      if (next !== undefined) patch[key] = next || null;
    }
    const stockChanged =
      patch.discordStockChannelId !== undefined && patch.discordStockChannelId !== settings.discordStockChannelId;
    if (stockChanged) patch.discordStockMessageId = null;
    const rankChanged =
      patch.discordLeaderboardChannelId !== undefined &&
      patch.discordLeaderboardChannelId !== settings.discordLeaderboardChannelId;
    if (rankChanged) patch.discordLeaderboardMessageId = null;
    updateShopSettings(shop.id, patch);
    await persistAsync();
    if (rankChanged && patch.discordLeaderboardChannelId) {
      void import("@/lib/discord/leaderboard-board").then(({ refreshLeaderboardBoard }) =>
        refreshLeaderboardBoard(shop.id).catch(() => null),
      );
    }
    if (stockChanged && patch.discordStockChannelId) {
      void import("@/lib/discord/stock-board").then(({ refreshStockBoard }) =>
        refreshStockBoard(shop.id).catch(() => null),
      );
    }
    return NextResponse.json(await payload(shop.id));
  }

  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const guildId =
    parsed.data.action === "save"
      ? parsed.data.shopGuildId || parsed.data.verifyGuildId || MFA_DISCORD_GUILD_ID
      : MFA_DISCORD_GUILD_ID;
  const synced = await syncMfaDoesDiscord(guildId);
  if (!synced.ok) {
    return NextResponse.json({ error: `명령어 동기화 실패: ${synced.error}` }, { status: 502 });
  }
  const sync = { shop: "ok", verify: "ok" };

  return NextResponse.json({
    ...(await payload(shop.id)),
    synced: sync,
  });
}
