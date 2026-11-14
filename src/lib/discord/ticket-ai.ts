import { container, mediaGallery, MessageFlags, textDisplay } from "@/lib/discord/components";
import { doesDiscordEnvAsync } from "@/lib/discord/does-env";
import { generateShopInquiryReply } from "@/lib/shop-inquiry-ai";
import { getShopBySlug, getShopSettings, initStore, MFA_DISCORD_GUILD_ID, MFA_SHOP_SLUG } from "@/lib/store";
import { fetchChannelMessages, postTicketChannelMessage, ticketBotRest, withTicketBotToken } from "@/lib/ticket-bot/rest";
import {
  getTicketByChannel,
  getTicketGuild,
  initTicketStore,
  listTicketGuilds,
  listTickets,
  markTicketStaffReply,
  persistTicketStore,
} from "@/lib/ticket-bot/store";
import type { ShopInquiryMessage } from "@/lib/types";

/** 웹 상점 문의 AI(shop-inquiry-ai)를 DOES 티켓 채널에 그대로 붙인다 — 메시지는 TicketGateway(Durable Object)가 넘겨 준다 */

const AI_FOOTER = "-# 안내 AI · 관리자가 답하면 AI는 꺼져요";
const GREETING =
  "### 안녕하세요, 안내 AI예요\n문의하실 내용을 편하게 적어 주세요. 상품·충전·인증은 바로 찾아서 답해 드려요.\n-# 관리자가 답하면 AI는 바로 꺼져요.";
const GREET_WINDOW_MS = 15 * 60_000;

function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://vendix.team").replace(/\/$/, "");
}
const PLACEHOLDER_RE = /^\((첨부 파일|봇 메시지|내용 없음[^)]*)\)$/;

export type TicketAiEvent = {
  guildId: string;
  channelId: string;
  messageId: string;
  authorId: string;
  content: string;
};

async function boot() {
  await Promise.all([initStore(), initTicketStore({ force: true })]);
  return getShopBySlug(MFA_SHOP_SLUG);
}

function doesGuildIds(shopId: string) {
  const ids = new Set([MFA_DISCORD_GUILD_ID]);
  const own = getShopSettings(shopId).discordGuildId;
  if (own) ids.add(own);
  for (const g of listTicketGuilds()) if (g.linkedShopSlug === MFA_SHOP_SLUG) ids.add(g.guildId);
  return ids;
}

function aiTickets(shopId: string) {
  return [...doesGuildIds(shopId)].flatMap((guildId) =>
    getTicketGuild(guildId)?.aiEnabled ? listTickets(guildId, "open").filter((t) => !t.aiPaused && t.openerId !== "unknown") : [],
  );
}

/** 게이트웨이가 지켜볼 채널 목록 (없으면 연결을 닫는다) */
export async function ticketAiBridgeConfig() {
  const shop = await boot();
  if (!shop) return { token: "", channels: [] as string[] };
  const channels = aiTickets(shop.id).map((t) => t.channelId);
  return { token: channels.length ? (await doesDiscordEnvAsync()).botToken : "", channels };
}

async function greetNewTickets(shopId: string, token: string) {
  const now = Date.now();
  const fresh = aiTickets(shopId).filter((t) => !t.aiGreetedAt && now - new Date(t.createdAt).getTime() < GREET_WINDOW_MS);
  if (!fresh.length) return;
  for (const t of fresh) t.aiGreetedAt = new Date().toISOString();
  await persistTicketStore();
  await withTicketBotToken(token, () =>
    Promise.all(
      fresh.map((t) =>
        postTicketChannelMessage(t.channelId, {
          flags: MessageFlags.IS_COMPONENTS_V2,
          components: [container([mediaGallery([`${appOrigin()}/brand/ticket.png`]), textDisplay(GREETING)])],
          allowed_mentions: { parse: [] },
        }),
      ),
    ),
  );
}

type GatewayNs = { get(id: unknown): { fetch(url: string, init?: RequestInit): Promise<Response> }; idFromName(name: string): unknown };

/** 티켓이 열리거나 AI 설정이 바뀌면 바로 게이트웨이에 알린다 (cron 은 5분마다 같은 일을 한다) */
export async function kickTicketGateway() {
  try {
    const config = await ticketAiBridgeConfig();
    const shop = getShopBySlug(MFA_SHOP_SLUG);
    if (shop && config.token) await greetNewTickets(shop.id, config.token);
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const ns = (env as { TICKET_GW?: GatewayNs }).TICKET_GW;
    if (!ns) return;
    await ns.get(ns.idFromName("does")).fetch("https://ticket-gateway/", {
      method: "POST",
      body: JSON.stringify(config.channels.length ? config : { stop: true }),
    });
  } catch (err) {
    console.log("ticket gateway kick failed", String(err));
  }
}

function threadFrom(messages: Awaited<ReturnType<typeof fetchChannelMessages>>, openerId: string): ShopInquiryMessage[] {
  return messages
    .filter((m) => m.content.trim() && !PLACEHOLDER_RE.test(m.content.trim()))
    .slice(-12)
    .map((m) => ({
      id: m.id,
      from: m.bot ? "ai" : m.authorId === openerId ? "user" : "admin",
      body: m.content.replace(AI_FOOTER, "").trim(),
      createdAt: m.createdAt,
    }));
}

/** 티켓 채널에 새 메시지 — 요청자면 AI 가 답하고, 다른 사람(관리자)이면 그 티켓의 AI 를 끈다 */
export async function handleTicketAiMessage(event: TicketAiEvent) {
  const shop = await boot();
  const done = async () => ({ channels: shop ? aiTickets(shop.id).map((t) => t.channelId) : [] });
  if (!shop || !doesGuildIds(shop.id).has(event.guildId)) return done();

  const ticket = getTicketByChannel(event.guildId, event.channelId);
  const guild = getTicketGuild(event.guildId);
  if (!ticket || ticket.status !== "open" || ticket.aiPaused || !guild?.aiEnabled) return done();

  const token = (await doesDiscordEnvAsync()).botToken;
  if (!token) return done();

  if (event.authorId !== ticket.openerId) {
    ticket.aiPaused = true;
    markTicketStaffReply(ticket.id);
    await persistTicketStore();
    await withTicketBotToken(token, () =>
      postTicketChannelMessage(event.channelId, { content: "-# 관리자가 들어와서 AI 안내를 껐어요." }),
    );
    return done();
  }

  const query = event.content.trim();
  if (!query) return done();

  await withTicketBotToken(token, async () => {
    await ticketBotRest("POST", `/channels/${event.channelId}/typing`);
    const history = await fetchChannelMessages(event.channelId, 20);
    const reply = await generateShopInquiryReply({
      shopId: shop.id,
      query,
      messages: threadFrom(history, ticket.openerId),
    });
    await postTicketChannelMessage(event.channelId, {
      content: `${reply.slice(0, 2000 - AI_FOOTER.length - 1)}\n${AI_FOOTER}`,
      message_reference: { message_id: event.messageId, fail_if_not_exists: false },
      allowed_mentions: { parse: [] },
    });
  });
  return done();
}
