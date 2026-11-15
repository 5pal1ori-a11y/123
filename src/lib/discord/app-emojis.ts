/**
 * DOES 봇 앱 이모지 (니트로 없이 봇이 어디서나 쓸 수 있는 커스텀 이모지).
 * 없으면 처음 한 번 올리고, ID 는 KV 에 기억해 둔다. 실패하면 일반 이모지로 대신한다.
 */
import { DOES_APPLICATION_ID } from "@/lib/discord/does-env";
import { EMOJI_STOCK_OK, EMOJI_STOCK_SOLD } from "@/lib/discord/emoji-images";
import { discordRest } from "@/lib/discord/rest";
import { kvGetJson, kvPutJson } from "@/lib/world/kv";

const WANT = {
  does_stock_ok: { image: EMOJI_STOCK_OK, animated: true, fallback: "🟢" },
  does_stock_sold: { image: EMOJI_STOCK_SOLD, animated: false, fallback: "⚫" },
} as const;
export type AppEmojiName = keyof typeof WANT;

const KV_KEY = "does:app-emojis:v1";
let cache: Partial<Record<AppEmojiName, string>> = {};
let ensured = false;

/** 메시지에 넣을 문자열 (<a:이름:ID>). 아직 없으면 일반 이모지 */
export function appEmoji(name: AppEmojiName) {
  return cache[name] ?? WANT[name].fallback;
}

export async function ensureAppEmojis(shopId?: string) {
  if (ensured) return;
  try {
    const saved = await kvGetJson<Partial<Record<AppEmojiName, string>>>(KV_KEY);
    if (saved && Object.keys(WANT).every((k) => saved[k as AppEmojiName])) {
      cache = saved;
      ensured = true;
      return;
    }
    const appId = DOES_APPLICATION_ID;
    const list = await discordRest("GET", `/applications/${appId}/emojis`, undefined, shopId);
    const items = list.ok ? ((list.json as { items?: { id: string; name: string; animated?: boolean }[] })?.items ?? []) : [];
    const next: Partial<Record<AppEmojiName, string>> = {};
    for (const [name, spec] of Object.entries(WANT) as [AppEmojiName, (typeof WANT)[AppEmojiName]][]) {
      let e = items.find((x) => x.name === name);
      if (!e) {
        const r = await discordRest("POST", `/applications/${appId}/emojis`, { name, image: spec.image }, shopId);
        if (r.ok) e = r.json as { id: string; name: string; animated?: boolean };
      }
      if (e?.id) next[name] = `<${e.animated ?? spec.animated ? "a" : ""}:${name}:${e.id}>`;
    }
    cache = { ...cache, ...next };
    if (Object.keys(WANT).every((k) => next[k as AppEmojiName])) {
      await kvPutJson(KV_KEY, next);
      ensured = true;
    }
  } catch (err) {
    console.error("[app-emojis] ensure failed", err);
  }
}
