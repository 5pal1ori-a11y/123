import { NextResponse } from "next/server";
import { updateDiscordBotPresence } from "@/lib/discord/presence";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-meta";
import { isProduction } from "@/lib/security";
import { runManageMaintenance } from "@/lib/manage-bot/maintenance";
import { runSecurityMaintenance } from "@/lib/security-bot/maintenance";
import { initVerifyStore } from "@/lib/verify-bot/store";
import { runVerifyMaintenance } from "@/lib/verify-bot/maintenance";
import { refreshMfaStock } from "@/lib/mfa";
import { initStore } from "@/lib/store";
import { syncMfaDoesDiscord } from "@/lib/discord/sync-mfa-does";
import { pushDoesLeaderboard } from "@/lib/discord/does-leaderboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauthorizedCron() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function assertCronAuth(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && secret.length >= 16) {
    const url = new URL(request.url);
    const auth = request.headers.get("authorization") || "";
    const q = url.searchParams.get("secret") || "";
    if (auth === `Bearer ${secret}` || q === secret) return null;
    return unauthorizedCron();
  }
  if (isProduction()) {
    if (request.headers.get("origin") || request.headers.get("sec-fetch-site") === "cross-site") {
      return unauthorizedCron();
    }
  }
  return null;
}

/** Cron: Discord presence + verify + security (temp unban / report / snapshot) */
export async function GET(request: Request) {
  const denied = assertCronAuth(request);
  if (denied) return denied;

  const rl = rateLimit(`cron:${clientIp(request)}`, 30, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  const result = await updateDiscordBotPresence();
  await initVerifyStore();
  const verify = await runVerifyMaintenance().catch((err) => {
    console.error("[verify-maintenance]", err);
    return { error: String(err) };
  });
  const security = await runSecurityMaintenance().catch((err) => {
    console.error("[security-maintenance]", err);
    return { error: String(err) };
  });
  const manage = await runManageMaintenance().catch((err) => {
    console.error("[manage-maintenance]", err);
    return { error: String(err) };
  });
  const mfa = await initStore()
    .then(() => refreshMfaStock())
    .catch((err) => {
      console.error("[mfa-stock]", err);
      return { error: String(err) };
    });
  const doesSync = await initStore()
    .then(() => initVerifyStore())
    .then(() => syncMfaDoesDiscord())
    .catch((err) => {
      console.error("[does-sync]", err);
      return { ok: false as const, error: String(err) };
    });
  const doesLeaderboard = await pushDoesLeaderboard().catch((err) => {
    console.error("[does-leaderboard]", err);
    return { ok: false as const, error: String(err) };
  });
  // 실시간 구매 랭킹 집계판 (채널을 정한 상점만)
  const rankBoards = await import("@/lib/discord/leaderboard-board")
    .then(async ({ refreshLeaderboardBoard }) => {
      const { getStoreForRead, getShopSettings } = await import("@/lib/store");
      const ids = getStoreForRead()
        .shops.map((s) => s.id)
        .filter((id) => getShopSettings(id).discordLeaderboardChannelId);
      const results = await Promise.all(ids.map((id) => refreshLeaderboardBoard(id).catch(() => ({ ok: false }))));
      return { shops: ids.length, ok: results.filter((r) => r.ok).length };
    })
    .catch((err) => ({ error: String(err) }));
  return NextResponse.json({ presence: result, verify, security, manage, mfa, doesSync, doesLeaderboard, rankBoards });
}

export async function POST(request: Request) {
  return GET(request);
}
