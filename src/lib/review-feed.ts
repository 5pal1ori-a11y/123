import {
  getDiscordCredentials,
  getShopById,
  getShopSettings,
  getStoreForRead,
  MFA_DISCORD_GUILD_ID,
  MFA_SHOP_SLUG,
} from "@/lib/store";

const DISCORD_API = "https://discord.com/api/v10";
const FEED_TTL_MS = 45_000;
const CHANNEL_TTL_MS = 10 * 60_000;
const MAX_PAGES = 4;

export type ReviewFeedItem = {
  id: string;
  source: "discord" | "site";
  authorId: string | null;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  rating: number | null;
  body: string;
  product: string | null;
  createdAt: string;
};

export type ReviewFeed = {
  items: ReviewFeedItem[];
  total: number;
  average: number | null;
  channelId: string | null;
  updatedAt: string;
};

type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  bot?: boolean;
};

type DiscordEmbed = {
  title?: string;
  description?: string;
  fields?: { name: string; value: string }[];
  author?: { name?: string; icon_url?: string };
  footer?: { text?: string };
  timestamp?: string;
};

type DiscordMessage = {
  id: string;
  type: number;
  content: string;
  author: DiscordUser;
  embeds?: DiscordEmbed[];
  mentions?: DiscordUser[];
  timestamp: string;
};

const feedCache = new Map<string, { at: number; feed: ReviewFeed }>();
const channelCache = new Map<string, { at: number; id: string | null }>();

export function discordAvatarUrl(user: Pick<DiscordUser, "id" | "avatar">) {
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
  try {
    return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> BigInt(22)) % BigInt(6))}.png`;
  } catch {
    return null;
  }
}

export function parseReviewRating(text: string): number | null {
  const stars = (text.match(/★|⭐|🌟/g) || []).length;
  if (stars >= 1 && stars <= 5) return stars;
  const m =
    text.match(/(?:평점|별점|점수|rating)\s*[:：]?\s*([1-5])(?:\.\d)?/i) ||
    text.match(/(?:^|\s)([1-5])\s*\/\s*5(?:\s|$|점)/) ||
    text.match(/(?:^|\s)([1-5])\s*점/);
  return m ? Number(m[1]) : null;
}

const NEGATIVE = /최악|별로|실망|느려|느림|늦게|늦어|사기|먹튀|환불|비추|불친절|안\s*옴|안\s*와|짜증|문제\s*있/;
const MILD = /괜찮|무난|보통|그럭저럭|나쁘지\s*않|아쉽|아쉬/;

/** 디스코드 후기 채널 글은 별점 없이 글만 남기는 경우가 대부분이라 내용으로 별점을 정한다 */
export function inferReviewRating(text: string): number {
  if (NEGATIVE.test(text)) return 2;
  if (MILD.test(text)) return 4;
  return 5;
}

function cleanBody(text: string) {
  return text
    .replace(/<@!?\d+>/g, "")
    .replace(/<a?:\w+:\d+>/g, "")
    .replace(/[★☆⭐🌟]/g, "")
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/(?:평점|별점|점수)\s*[:：]?\s*[1-5](?:\.\d)?\s*(?:점|\/\s*5)?/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const BODY_FIELD = /내용|후기|리뷰|review|comment|메시지|코멘트/i;
const WRITER_FIELD = /작성자|구매자|유저|회원|user|buyer|author|닉네임/i;
const PRODUCT_FIELD = /상품|제품|product|품목|구매\s*항목/i;

function mentionUser(text: string, mentions: DiscordUser[]): DiscordUser | null {
  const m = text.match(/<@!?(\d+)>/);
  if (!m) return null;
  return mentions.find((u) => u.id === m[1]) ?? { id: m[1]!, username: "" };
}

function parseMessage(msg: DiscordMessage): ReviewFeedItem | null {
  if (msg.type !== 0 && msg.type !== 19 && msg.type !== 20) return null;
  const mentions = msg.mentions ?? [];
  const embed = msg.embeds?.find((e) => e.description || e.fields?.length || e.title);

  let writer: DiscordUser | null = null;
  let body = "";
  let product: string | null = null;
  let rating: number | null = null;
  let createdAt = msg.timestamp;

  if (msg.author.bot) {
    if (embed) {
      const fields = embed.fields ?? [];
      const all = [
        embed.title,
        embed.description,
        ...fields.map((f) => `${f.name} ${f.value}`),
        embed.footer?.text,
        msg.content,
      ]
        .filter(Boolean)
        .join("\n");
      const writerField = fields.find((f) => WRITER_FIELD.test(f.name));
      writer =
        mentionUser(writerField?.value ?? "", mentions) ??
        mentionUser(all, mentions) ??
        (embed.author?.name ? { id: "", username: embed.author.name } : null);
      if (!writer && writerField) writer = { id: "", username: cleanBody(writerField.value) };
      const bodyField = fields.find((f) => BODY_FIELD.test(f.name) && !WRITER_FIELD.test(f.name));
      body = cleanBody(bodyField?.value ?? embed.description ?? "");
      if (!body) {
        const longest = fields
          .filter((f) => !WRITER_FIELD.test(f.name) && !PRODUCT_FIELD.test(f.name))
          .sort((a, b) => b.value.length - a.value.length)[0];
        body = cleanBody(longest?.value ?? msg.content ?? "");
      }
      const productField = fields.find((f) => PRODUCT_FIELD.test(f.name) && !WRITER_FIELD.test(f.name));
      product = productField ? cleanBody(productField.value) || null : null;
      rating = parseReviewRating(all);
      if (embed.timestamp) createdAt = embed.timestamp;
    } else {
      writer = mentionUser(msg.content, mentions);
      body = cleanBody(msg.content);
      rating = parseReviewRating(msg.content);
    }
  } else {
    writer = msg.author;
    body = cleanBody(msg.content);
    rating = parseReviewRating(msg.content);
  }

  if (!body || body.length < 2) return null;
  rating ??= inferReviewRating(body);
  const id = writer?.id || null;
  const username = writer?.username || null;
  return {
    id: `d_${msg.id}`,
    source: "discord",
    authorId: id,
    displayName: writer?.global_name || username || "알 수 없음",
    username,
    avatarUrl: id && writer ? discordAvatarUrl(writer) : null,
    rating,
    body: body.slice(0, 1000),
    product,
    createdAt,
  };
}

async function discordGet<T>(path: string, token: string): Promise<T | null> {
  const res = await fetch(`${DISCORD_API}${path}`, {
    headers: { Authorization: `Bot ${token}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

export async function shopBotToken(shopId: string) {
  const shop = getShopById(shopId);
  if (shop?.slug === MFA_SHOP_SLUG) {
    const { doesDiscordEnvAsync } = await import("@/lib/discord/does-env");
    const env = await doesDiscordEnvAsync();
    if (env.botToken) return env.botToken;
  }
  return getDiscordCredentials(shopId).botToken;
}

async function resolveChannelId(shopId: string, token: string) {
  const settings = getShopSettings(shopId);
  const configured = settings.reviewFeedChannelId?.trim();
  if (configured) return configured;
  const cached = channelCache.get(shopId);
  if (cached && Date.now() - cached.at < CHANNEL_TTL_MS) return cached.id;
  const shop = getShopById(shopId);
  const guildId = settings.discordGuildId || (shop?.slug === MFA_SHOP_SLUG ? MFA_DISCORD_GUILD_ID : null);
  let id: string | null = null;
  if (guildId) {
    const channels = await discordGet<{ id: string; name: string; type: number }[]>(
      `/guilds/${guildId}/channels`,
      token,
    );
    const text = (channels ?? []).filter((c) => c.type === 0 || c.type === 5);
    const pick =
      text.find((c) => /후기/.test(c.name) && !/로그|log|관리/i.test(c.name)) ??
      text.find((c) => /review|리뷰|vouch|바우처/i.test(c.name));
    id = pick?.id ?? null;
  }
  channelCache.set(shopId, { at: Date.now(), id });
  return id;
}

async function fetchDiscordReviews(shopId: string) {
  const token = await shopBotToken(shopId);
  if (!token) return { channelId: null, items: [] as ReviewFeedItem[] };
  const channelId = await resolveChannelId(shopId, token);
  if (!channelId) return { channelId: null, items: [] as ReviewFeedItem[] };

  const items: ReviewFeedItem[] = [];
  let before = "";
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await discordGet<DiscordMessage[]>(
      `/channels/${channelId}/messages?limit=100${before ? `&before=${before}` : ""}`,
      token,
    );
    if (!batch?.length) break;
    for (const msg of batch) {
      const item = parseMessage(msg);
      if (item) items.push(item);
    }
    before = batch[batch.length - 1]!.id;
    if (batch.length < 100) break;
  }
  return { channelId, items };
}

function siteReviews(shopId: string): ReviewFeedItem[] {
  const store = getStoreForRead();
  const users = new Map(store.users.filter((u) => u.shopId === shopId).map((u) => [u.id, u]));
  const products = new Map(store.products.filter((p) => p.shopId === shopId).map((p) => [p.id, p.name]));
  return store.reviews
    .filter((r) => r.shopId === shopId && r.approved)
    .map((r) => {
      const u = users.get(r.userId);
      const discordId = u?.discordId ?? null;
      return {
        id: `s_${r.id}`,
        source: "site" as const,
        authorId: discordId,
        displayName: u?.discordUsername || u?.name || "회원",
        username: u?.discordUsername || null,
        avatarUrl: discordId ? discordAvatarUrl({ id: discordId, avatar: null }) : null,
        rating: r.rating,
        body: r.body,
        product: r.productId ? products.get(r.productId) ?? null : null,
        createdAt: r.createdAt,
      };
    });
}

function bodyKey(text: string) {
  return text.replace(/\s+/g, "").slice(0, 40);
}

export async function getReviewFeed(shopId: string, opts?: { fresh?: boolean }): Promise<ReviewFeed> {
  const cached = feedCache.get(shopId);
  if (!opts?.fresh && cached && Date.now() - cached.at < FEED_TTL_MS) return cached.feed;

  let discord: { channelId: string | null; items: ReviewFeedItem[] } = { channelId: null, items: [] };
  try {
    discord = await fetchDiscordReviews(shopId);
  } catch (err) {
    console.error("[review-feed] discord fetch failed", err);
    if (cached) return cached.feed;
  }

  const site = siteReviews(shopId);
  const siteKeys = new Set(site.map((r) => bodyKey(r.body)));
  const items = [...site, ...discord.items.filter((r) => !siteKeys.has(bodyKey(r.body)))].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const rated = items.filter((r) => r.rating !== null);
  const feed: ReviewFeed = {
    items,
    total: items.length,
    average: rated.length ? rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length : null,
    channelId: discord.channelId,
    updatedAt: new Date().toISOString(),
  };
  feedCache.set(shopId, { at: Date.now(), feed });
  return feed;
}
