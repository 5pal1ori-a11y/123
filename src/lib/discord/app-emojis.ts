/**
 * DOES 봇 앱 이모지 — 직접 그린 커스텀 이모지 (니트로 없이 봇이 어느 서버에서나 쓸 수 있다).
 * 그림은 scripts/make-bot-emojis.py. 없으면 처음 한 번 봇 앱에 올리고, ID 는 KV 에 기억해 둔다.
 * 아직 준비가 안 됐거나 실패하면 일반 이모지로 대신한다.
 */
import { DOES_APPLICATION_ID } from "@/lib/discord/does-env";
import { BOT_EMOJI_IMAGES } from "@/lib/discord/emoji-images";
import { discordRest } from "@/lib/discord/rest";
import { kvGetJson, kvPutJson } from "@/lib/world/kv";

export type AppEmojiName = keyof typeof BOT_EMOJI_IMAGES;

const FALLBACK: Record<AppEmojiName, string> = {
  does_check: "✅",
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

const KV_KEY = "does:app-emojis:v2";
let cache: Partial<Record<AppEmojiName, string>> = {};
let ensured = false;
let inflight: Promise<void> | null = null;

/** 메시지 글자에 넣을 문자열 (<a:이름:ID>) */
export function appEmoji(name: AppEmojiName) {
  return cache[name] ?? FALLBACK[name];
}

/** 버튼 emoji 칸에 넣을 값 (components.button 이 <a:이름:ID> 를 알아본다) */
export const buttonEmoji = appEmoji;

export function ensureAppEmojis(shopId?: string) {
  if (ensured) return Promise.resolve();
  inflight ??= load(shopId).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function load(shopId?: string) {
  const names = Object.keys(BOT_EMOJI_IMAGES) as AppEmojiName[];
  try {
    const saved = await kvGetJson<Partial<Record<AppEmojiName, string>>>(KV_KEY);
    if (saved && names.every((n) => saved[n])) {
      cache = saved;
      ensured = true;
      return;
    }
    // 봇 토큰이 속한 앱의 ID (설정값과 다를 수 있어 토큰으로 직접 확인)
    const me = await discordRest("GET", "/applications/@me", undefined, shopId);
    const appId = (me.ok ? (me.json as { id?: string })?.id : null) || DOES_APPLICATION_ID;
    const list = await discordRest("GET", `/applications/${appId}/emojis`, undefined, shopId);
    if (!list.ok) return;
    const items = (list.json as { items?: { id: string; name: string; animated?: boolean }[] })?.items ?? [];
    const next: Partial<Record<AppEmojiName, string>> = {};
    for (const name of names) {
      const spec = BOT_EMOJI_IMAGES[name];
      let e = items.find((x) => x.name === name);
      if (!e) {
        const r = await discordRest("POST", `/applications/${appId}/emojis`, { name, image: spec.image }, shopId);
        if (r.ok) e = r.json as { id: string; name: string; animated?: boolean };
      }
      if (e?.id) next[name] = `<${(e.animated ?? spec.animated) ? "a" : ""}:${name}:${e.id}>`;
    }
    cache = { ...cache, ...next };
    if (names.every((n) => next[n])) {
      await kvPutJson(KV_KEY, next);
      ensured = true;
    }
  } catch (err) {
    console.error("[app-emojis] ensure failed", err);
  }
}
