/**
 * DOES 봇 앱 이모지 — 직접 그린 커스텀 이모지 (니트로 없이 봇이 어느 서버에서나 쓸 수 있다).
 * 그림은 scripts/make-bot-emojis.py. 없으면 처음 한 번 봇 앱에 올리고, ID 는 KV 에 기억해 둔다.
 * 아직 준비가 안 됐거나 실패하면 일반 이모지로 대신한다.
 */
import { BOT_EMOJI_IMAGES } from "@/lib/discord/emoji-images";
import { kvGetJson, kvPutJson } from "@/lib/world/kv";

export type AppEmojiName = keyof typeof BOT_EMOJI_IMAGES;

const FALLBACK: Record<AppEmojiName, string> = {
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
const KV_KEY = "does:app-emojis:v5";
let cache: Partial<Record<AppEmojiName, string>> = {};
let ensured = false;
let inflight: Promise<void> | null = null;

/** 메시지 글자에 넣을 문자열 (<a:이름:ID>) */
export function appEmoji(name: AppEmojiName) {
  return cache[name] ?? FALLBACK[name];
}

/**
 * 명령·버튼에 대한 답장(웹훅) 글자용 — 디스코드는 채널에서 @everyone 에게 '외부 이모지 사용' 권한이 없으면
 * 답장 글자 속 커스텀 이모지를 :이름: 으로 보여 준다. 그래서 답장 글자에는 일반 이모지를 쓴다.
 * (버튼 이모지 · 봇이 채널에 직접 올리는 메시지는 이 제한이 없어 appEmoji 를 쓴다)
 */
export function plainEmoji(name: AppEmojiName) {
  return FALLBACK[name];
}

/** 버튼 emoji 칸에 넣을 값 (components.button 이 <a:이름:ID> 를 알아본다) */
export const buttonEmoji = appEmoji;

/** 반응(리액션) 주소에 넣을 값: 커스텀이면 "이름:ID", 아니면 일반 이모지 */
export function reactionEmoji(name: AppEmojiName) {
  const v = appEmoji(name);
  const m = /^<a?:(\w+):(\d+)>$/.exec(v);
  return m ? `${m[1]}:${m[2]}` : v;
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
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) console.error("[app-emojis]", method, path, res.status, json);
  return { ok: res.ok, status: res.status, json };
}

async function load() {
  const names = Object.keys(BOT_EMOJI_IMAGES) as AppEmojiName[];
  try {
    const me = await doesApi("GET", "/applications/@me");
    const appId = me.ok ? (me.json as { id?: string })?.id : null;
    if (!appId) return;
    const saved = await kvGetJson<{ appId: string; map: Partial<Record<AppEmojiName, string>> }>(KV_KEY);
    if (saved?.appId === appId && names.every((n) => saved.map[n])) {
      cache = saved.map;
      ensured = true;
      return;
    }
    const list = await doesApi("GET", `/applications/${appId}/emojis`);
    if (!list.ok) return;
    const items = (list.json as { items?: { id: string; name: string; animated?: boolean }[] })?.items ?? [];
    const next: Partial<Record<AppEmojiName, string>> = {};
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
