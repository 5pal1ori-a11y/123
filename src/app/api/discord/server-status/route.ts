import { NextResponse } from "next/server";
import { z } from "zod";
import { hasInternalSecret } from "@/lib/internal-secret";
import { doesDiscordEnvAsync } from "@/lib/discord/does-env";
import { applyPresence } from "@/lib/discord/server-status";
import { getShopBySlug, getShopSettings, initStore, MFA_DISCORD_GUILD_ID, MFA_SHOP_SLUG } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const snowflake = z.string().regex(/^\d{5,30}$/);
const bodySchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("config") }),
  z.object({ op: z.literal("poll") }),
  z.object({
    op: z.literal("guess"),
    channelId: snowflake,
    messageId: snowflake,
    userId: snowflake,
    guess: z.number().int().min(0).max(999_999_999),
  }),
  z.object({ op: z.literal("member_remove"), userId: snowflake, guildId: snowflake }),
  z.object({
    op: z.literal("member_add"),
    userId: snowflake,
    guildId: snowflake,
    avatar: z.string().max(80).nullable().optional(),
    bot: z.boolean().optional(),
  }),
  z.object({ op: z.literal("presence"), userId: snowflake, status: z.enum(["online", "idle", "dnd", "offline"]) }),
]);

async function statusWatchEnabled() {
  let v = process.env.STATUS_WATCH_ENABLED ?? "";
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    v = (env as Record<string, string | undefined>).STATUS_WATCH_ENABLED ?? v;
  } catch {
    /* local */
  }
  return v.trim() === "1";
}

/** StatusWatch Durable Object 전용 (x-vendix-bridge-secret) */
export async function POST(request: Request) {
  if (!(await hasInternalSecret(request))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await initStore();
  await (await import("@/lib/discord/app-emojis")).ensureAppEmojis();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const shop = getShopBySlug(MFA_SHOP_SLUG);
  if (!shop) return NextResponse.json({ token: "", guildId: "", userIds: [] });
  const settings = getShopSettings(shop.id);

  if (parsed.data.op === "poll") {
    const { pollAndRefresh } = await import("@/lib/discord/server-status");
    const r = await pollAndRefresh(shop.id, settings.discordGuildId || MFA_DISCORD_GUILD_ID).catch((err) => ({
      ok: false as const,
      error: String(err),
    }));
    // 같은 3분 크론에서 문의 대기 현황 패널도 고쳐 쓴다
    const { refreshTicketQueuePanels } = await import("@/lib/discord/ticket-queue");
    const queue = await refreshTicketQueuePanels(shop.id).catch((err) => ({ error: String(err) }));
    // 구매 랭킹(리더보드) · 재고현황은 10분에 한 번
    const rank = await refreshRankingEvery10m(shop.id).catch((err) => ({ error: String(err) }));
    return NextResponse.json({ ...r, queue, rank });
  }
  if (parsed.data.op === "guess") {
    const { handleNumberGuessMessage } = await import("@/lib/discord/number-guess");
    const d = parsed.data;
    return NextResponse.json(await handleNumberGuessMessage(shop, d.channelId, d.messageId, d.userId, d.guess));
  }
  if (parsed.data.op === "member_remove") {
    const { onMemberLeave } = await import("@/lib/discord/invites");
    await onMemberLeave(parsed.data.guildId, parsed.data.userId).catch(() => null);
    return NextResponse.json({ ok: true });
  }
  if (parsed.data.op === "member_add") {
    if (parsed.data.bot) return NextResponse.json({ ok: true, skipped: "bot" });
    // 초대 추적 (어느 링크로 들어왔는지) — 실패해도 환영 메시지는 보낸다
    const join = parsed.data;
    const inviter = await import("@/lib/discord/invites")
      .then(({ onMemberJoin }) => onMemberJoin(shop.id, join.guildId, join.userId, join.avatar ?? null))
      .catch((err) => {
        console.error("[invites] join failed", err);
        return null;
      });
    void inviter;
    const { postWelcome } = await import("@/lib/discord/welcome");
    return NextResponse.json(
      await postWelcome(shop.id, { userId: parsed.data.userId, avatar: parsed.data.avatar, guildId: parsed.data.guildId }),
    );
  }
  if (parsed.data.op === "config") {
    // 게이트웨이를 계속 붙잡아 두면 Durable Object 사용 시간이 하루 약 10,800 GB-s 든다.
    // 무료 플랜(하루 13,000)에서는 자동충전(Pushbullet 브리지)까지 멈추게 되므로
    // STATUS_WATCH_ENABLED=1 (유료 플랜) 일 때만 붙는다.
    const enabled = await statusWatchEnabled();
    return NextResponse.json({
      token: enabled ? (await doesDiscordEnvAsync()).botToken : "",
      guildId: settings.discordGuildId || MFA_DISCORD_GUILD_ID,
      // 관리자 상태는 3분 크론(op: poll)으로 확인하고, 상시 연결은 봇 '온라인' 표시용으로만 쓴다
      userIds: [] as string[],
    });
  }
  return NextResponse.json(await applyPresence(shop.id, parsed.data.userId, parsed.data.status));
}

const RANK_KEY = "does:rank-refreshed-at";

async function refreshRankingEvery10m(shopId: string) {
  const { kvGetJson, kvPutJson } = await import("@/lib/world/kv");
  const at = (await kvGetJson<number>(RANK_KEY)) ?? 0;
  if (Date.now() - at < 10 * 60_000 - 30_000) return { skipped: true };
  await kvPutJson(RANK_KEY, Date.now());
  const [{ refreshLeaderboardBoard }, { pushDoesLeaderboard }, { refreshStockBoard }, { refreshRandomBoxPanels }] =
    await Promise.all([
      import("@/lib/discord/leaderboard-board"),
      import("@/lib/discord/does-leaderboard"),
      import("@/lib/discord/stock-board"),
      import("@/lib/discord/handlers"),
    ]);
  // 예전 마크 계정을 MFA MARKET 재고로 옮겨 16자리 코드로 지급되게 한다 (끝날 때까지 몇 개씩)
  {
    const doneKey = `mfa-migrate-done:v2:${shopId}`;
    if (!(await kvGetJson<unknown>(doneKey))) {
      const r = await import("@/lib/mfa-migrate")
        .then(({ migrateMcAccountsToMfa }) => migrateMcAccountsToMfa(shopId))
        .catch((err) => ({ error: String(err), remaining: -1 }));
      const logKey = `mfa-migrate-log:${shopId}`;
      const log = (await kvGetJson<unknown[]>(logKey)) ?? [];
      await kvPutJson(logKey, [...log, { at: new Date().toISOString(), r }].slice(-30), 30 * 86_400);
      if ("remaining" in r && r.remaining === 0) await kvPutJson(doneKey, { at: new Date().toISOString() });
    }
  }
  // DOES 서버에 봇 이모지(3D) + 망토 이모지 올리기 (10분마다 몇 개씩, 다 올리면 멈춤)
  {
    const { kvGetJson, kvPutJson } = await import("@/lib/world/kv");
    const doneKey = "guild-emojis-done:v2";
    if (!(await kvGetJson<unknown>(doneKey))) {
      const repKey = "guild-emojis-replaced:v2";
      const replaced = new Set((await kvGetJson<string[]>(repKey)) ?? []);
      const r = await import("@/lib/discord/guild-emojis")
        .then(({ uploadGuildEmojis }) => uploadGuildEmojis(12, replaced))
        .catch((err) => ({ added: [] as string[], removed: [] as string[], existed: 0, failed: [{ name: "-", reason: String(err) }], slotsFull: [] as string[] }));
      const nowReplaced = [...replaced, ...r.added.filter((n) => n.startsWith("does_"))];
      if (nowReplaced.length !== replaced.size) await kvPutJson(repKey, nowReplaced);
      const log = (await kvGetJson<unknown[]>("guild-emojis-log")) ?? [];
      await kvPutJson("guild-emojis-log", [...log, { at: new Date().toISOString(), r }].slice(-30), 30 * 86_400);
      if (!r.failed.length && r.added.length < 12) await kvPutJson(doneKey, { at: new Date().toISOString(), slotsFull: r.slotsFull });
    }
  }
  // 프리미엄 플랜: 월 포인트 지급 · 만료 역할 회수
  await import("@/lib/premium")
    .then(async ({ premiumCron }) => {
      const { getStoreForRead } = await import("@/lib/store");
      return premiumCron(shopId, getStoreForRead().users.filter((u) => u.shopId === shopId && u.premium));
    })
    .catch((err) => console.error("[premium] cron failed", err));
  // 재고현황판도 같은 주기로 새로 고쳐 쓴다 (재고가 바뀔 때도 따로 갱신됨)
  const [board, top, stock] = await Promise.all([
    refreshLeaderboardBoard(shopId).catch(() => ({ ok: false })),
    pushDoesLeaderboard(shopId).catch(() => ({ ok: false })),
    refreshStockBoard(shopId).catch(() => ({ ok: false })),
  ]);
  // 초대 랭킹판 (1시간에 한 번)
  const invAt = (await kvGetJson<number>("invites:rank-at")) ?? 0;
  if (Date.now() - invAt > 60 * 60_000 - 60_000) {
    await kvPutJson("invites:rank-at", Date.now());
    const { refreshInviteRanks } = await import("@/lib/discord/invites");
    await refreshInviteRanks(shopId).catch(() => null);
  }
  // 다이아 캐기 패널 TOP 3
  const rbox = await refreshRandomBoxPanels(shopId).catch(() => ({ panels: -1 }));
  return { board: board.ok, top: top.ok, stock: stock.ok, rbox: rbox.panels };
}
