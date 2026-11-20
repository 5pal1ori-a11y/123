/**
 * DOES 봇 앱 이모지 — 직접 그린 커스텀 이모지 (니트로 없이 봇이 어느 서버에서나 쓸 수 있다).
 * 그림은 scripts/make-bot-emojis.py. 없으면 처음 한 번 봇 앱에 올리고, ID 는 KV 에 기억해 둔다.
 * 아직 준비가 안 됐거나 실패하면 일반 이모지로 대신한다.
 */
import { BOT_EMOJI_IMAGES } from "@/lib/discord/emoji-images";
import { kvGetJson, kvPutJson } from "@/lib/world/kv";

export type BotEmojiName = keyof typeof BOT_EMOJI_IMAGES;
/** DOES 서버에만 올린 2D 이모지 (앱 이모지에는 없음) */
const EXTRA_FALLBACK = {
  does_bell: "🔔",
  does_calendar: "📅",
  does_card: "💳",
  does_cart: "🛒",
  does_chart: "📊",
  does_clock: "⏰",
  does_coin: "🪙",
  does_crown: "👑",
  does_discount: "🏷️",
  does_fire: "🔥",
  does_heart: "💖",
  does_info: "ℹ️",
  does_key: "🔑",
  does_lightning: "⚡",
  does_link: "🔗",
  does_lock: "🔒",
  does_logo: "◆",
  does_medal: "🏅",
  does_megaphone: "📢",
  does_new: "🆕",
  does_pickaxe: "⛏️",
  does_question: "❓",
  does_rocket: "🚀",
  does_shield: "🛡️",
  does_sparkles: "✨",
  does_sword: "⚔️",
  does_trophy: "🏆",
  does_user: "👤",
  does_verified: "☑️",
  does_warning: "⚠️",
  does_ltc: "🪙",
  does_trx: "🔺",
} as const;
export type AppEmojiName = BotEmojiName | keyof typeof EXTRA_FALLBACK;

const FALLBACK: Record<AppEmojiName, string> = {
  ...EXTRA_FALLBACK,
  does_check: "✅",
  does_cross: "❌",
  does_star: "⭐",
  does_online: "🟢",
  does_offline: "⚫",
  does_inbox: "📥",
  does_gift: "🎁",
  does_party: "🎉",
  does_clover: "🍀",
  does_ticket: "🎟️",
  does_jackpot: "🎰",
  does_mail: "📨",
  does_robot: "🤖",
  does_plus: "➕",
  does_island: "🏝️",
  does_gem: "💎",
  does_tree: "🌳",
  does_sprout: "🌱",
  does_flag: "🚩",
  does_brick: "🧱",
  does_sold: "⚫",
};

/** v5: 2D 고퀄 그림으로 교체 — 예전 그림은 같은 이름이면 지우고 다시 올린다 */
const KV_KEY = "does:app-emojis:v6";
let cache: Partial<Record<AppEmojiName, string>> = {};
/** DOES 서버(길드) 이모지 — 서버 안에서는 답장 글자에서도 그림으로 보인다 (외부 이모지 아님) */
export const GUILD_EMOJI_MAP_KEY = "does:guild-emoji-map:v1";
let guildCache: Record<string, string> = {};
let ensured = false;
let inflight: Promise<void> | null = null;

/** 커스텀 이모지 없이 일반 이모지만 */
export function fallbackEmoji(name: AppEmojiName) {
  return FALLBACK[name];
}

/** 메시지 글자에 넣을 문자열 (<a:이름:ID>) */
export function appEmoji(name: AppEmojiName) {
  return guildCache[name] ?? cache[name] ?? FALLBACK[name];
}

/**
 * 명령·버튼에 대한 답장(웹훅) 글자용 — 디스코드는 채널에서 @everyone 에게 '외부 이모지 사용' 권한이 없으면
 * 답장 글자 속 커스텀 이모지를 :이름: 으로 보여 준다. 그래서 답장 글자에는 일반 이모지를 쓴다.
 * (버튼 이모지 · 봇이 채널에 직접 올리는 메시지는 이 제한이 없어 appEmoji 를 쓴다)
 */
export function plainEmoji(name: AppEmojiName) {
  return guildCache[name] ?? FALLBACK[name];
}

/** 망토 이모지 (cape_<종류>) — 서버에 올라가 있으면 그림, 아니면 빈 문자열 */
export function capeEmoji(type: string) {
  return guildCache[`cape_${type.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 26)}`] ?? "";
}

/** 버튼 emoji 칸에 넣을 값 (components.button 이 <a:이름:ID> 를 알아본다) */
export const buttonEmoji = appEmoji;

/** 반응(리액션) 주소에 넣을 값: 커스텀이면 "이름:ID", 아니면 일반 이모지 */
export function reactionEmoji(name: AppEmojiName) {
  const v = appEmoji(name);
  const m = /^<a?:(\w+):(\d+)>$/.exec(v);
  return m ? `${m[1]}:${m[2]}` : v;
}

/**
 * KV 에 저장된 이모지 ID 만 읽어 온다 (디스코드 API 호출·업로드 없음).
 * 누구나 부르는 공개 주소(링크 미리보기 등)에서 appEmoji 를 쓸 때 사용한다.
 */
export async function loadSavedEmojis() {
  const [guild, saved] = await Promise.all([
    kvGetJson<Record<string, string>>(GUILD_EMOJI_MAP_KEY).catch(() => null),
    kvGetJson<{ appId: string; map: Partial<Record<BotEmojiName, string>> }>(KV_KEY).catch(() => null),
  ]);
  if (guild) guildCache = guild;
  if (saved?.map) cache = { ...saved.map, ...cache };
}

export function ensureAppEmojis(_shopId?: string) {
  if (ensured) return Promise.resolve();
  inflight ??= load().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** 이모지는 그 앱의 봇만 글자 속에서 쓸 수 있으므로, 반드시 DOES 봇 토큰으로 다룬다 */
async function doesApi(method: string, path: string, body?: unknown) {
  const { doesDiscordEnvAsync } = await import("@/lib/discord/does-env");
  const token = (await doesDiscordEnvAsync()).botToken;
  if (!token) return { ok: false, status: 0, json: null as unknown };
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: body === undefined ? { Authorization: `Bot ${token}` } : { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) console.error("[app-emojis]", method, path, res.status, json);
  return { ok: res.ok, status: res.status, json };
}

async function load() {
  guildCache = (await kvGetJson<Record<string, string>>(GUILD_EMOJI_MAP_KEY).catch(() => null)) ?? guildCache;
  const names = Object.keys(BOT_EMOJI_IMAGES) as BotEmojiName[];
  try {
    const me = await doesApi("GET", "/applications/@me");
    const appId = me.ok ? (me.json as { id?: string })?.id : null;
    if (!appId) return;
    const saved = await kvGetJson<{ appId: string; map: Partial<Record<BotEmojiName, string>> }>(KV_KEY);
    if (saved?.appId === appId && names.every((n) => saved.map[n])) {
      cache = saved.map;
      ensured = true;
      return;
    }
    const list = await doesApi("GET", `/applications/${appId}/emojis`);
    if (!list.ok) return;
    const items = (list.json as { items?: { id: string; name: string; animated?: boolean }[] })?.items ?? [];
    const next: Partial<Record<BotEmojiName, string>> = {};
    for (const name of names) {
      const spec = BOT_EMOJI_IMAGES[name];
      let e = items.find((x) => x.name === name);
      if (e && saved?.appId === appId && saved.map[name]) {
        /* 이번 버전에서 이미 올린 것 */
      } else if (e) {
        // 예전 그림 — 지우고 새 그림으로 다시 올린다
        const del = await doesApi("DELETE", `/applications/${appId}/emojis/${e.id}`);
        if (del.ok || del.status === 404) e = undefined;
      }
      if (!e) {
        const r = await doesApi("POST", `/applications/${appId}/emojis`, { name, image: spec.image });
        if (r.ok) e = r.json as { id: string; name: string; animated?: boolean };
      }
      if (e?.id) next[name] = `<${(e.animated ?? spec.animated) ? "a" : ""}:${name}:${e.id}>`;
    }
    if (names.every((n) => next[n])) {
      cache = next;
      await kvPutJson(KV_KEY, { appId, map: next });
      ensured = true;
    }
  } catch (err) {
    console.error("[app-emojis] ensure failed", err);
  }
}
