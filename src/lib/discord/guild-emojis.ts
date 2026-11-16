/**
 * DOES 디스코드 서버(길드)에 커스텀 이모지를 올린다 — 2D 이모지 50종(does_*) + 망토 49종(cape_*).
 * 그림은 public/emoji/ 에 있고, 사이트 주소에서 읽어 base64 로 올린다.
 * 이미 같은 이름이 있으면 건너뛰고, 서버 슬롯이 꽉 차면(30008) 그 종류(정지/움직이는)는 멈춘다.
 */
import { doesDiscordEnvAsync } from "@/lib/discord/does-env";
import { MFA_DISCORD_GUILD_ID } from "@/lib/store";

export const GUILD_EMOJIS: { name: string; file: string }[] = [
  { name: "does_bell", file: "does_bell.png" },
  { name: "does_brick", file: "does_brick.png" },
  { name: "does_calendar", file: "does_calendar.png" },
  { name: "does_card", file: "does_card.png" },
  { name: "does_cart", file: "does_cart.png" },
  { name: "does_chart", file: "does_chart.png" },
  { name: "does_check", file: "does_check.gif" },
  { name: "does_clock", file: "does_clock.png" },
  { name: "does_clover", file: "does_clover.png" },
  { name: "does_coin", file: "does_coin.png" },
  { name: "does_cross", file: "does_cross.png" },
  { name: "does_crown", file: "does_crown.png" },
  { name: "does_discount", file: "does_discount.png" },
  { name: "does_fire", file: "does_fire.png" },
  { name: "does_flag", file: "does_flag.png" },
  { name: "does_gem", file: "does_gem.gif" },
  { name: "does_gift", file: "does_gift.gif" },
  { name: "does_heart", file: "does_heart.png" },
  { name: "does_inbox", file: "does_inbox.png" },
  { name: "does_info", file: "does_info.png" },
  { name: "does_island", file: "does_island.png" },
  { name: "does_jackpot", file: "does_jackpot.gif" },
  { name: "does_key", file: "does_key.png" },
  { name: "does_lightning", file: "does_lightning.png" },
  { name: "does_link", file: "does_link.png" },
  { name: "does_lock", file: "does_lock.png" },
  { name: "does_mail", file: "does_mail.png" },
  { name: "does_medal", file: "does_medal.png" },
  { name: "does_megaphone", file: "does_megaphone.png" },
  { name: "does_new", file: "does_new.png" },
  { name: "does_offline", file: "does_offline.png" },
  { name: "does_online", file: "does_online.gif" },
  { name: "does_party", file: "does_party.png" },
  { name: "does_pickaxe", file: "does_pickaxe.png" },
  { name: "does_plus", file: "does_plus.png" },
  { name: "does_question", file: "does_question.png" },
  { name: "does_robot", file: "does_robot.png" },
  { name: "does_rocket", file: "does_rocket.png" },
  { name: "does_shield", file: "does_shield.png" },
  { name: "does_sold", file: "does_sold.png" },
  { name: "does_sparkles", file: "does_sparkles.png" },
  { name: "does_sprout", file: "does_sprout.png" },
  { name: "does_star", file: "does_star.gif" },
  { name: "does_sword", file: "does_sword.png" },
  { name: "does_ticket", file: "does_ticket.png" },
  { name: "does_tree", file: "does_tree.png" },
  { name: "does_trophy", file: "does_trophy.png" },
  { name: "does_user", file: "does_user.png" },
  { name: "does_verified", file: "does_verified.png" },
  { name: "does_warning", file: "does_warning.png" },
  { name: "cape_aurora", file: "cape_aurora.png" },
  { name: "cape_moonlighttrail", file: "cape_moonlighttrail.png" },
  { name: "cape_mcexp", file: "cape_mcexp.png" },
  { name: "cape_crafter", file: "cape_crafter.png" },
  { name: "cape_copper", file: "cape_copper.png" },
  { name: "cape_home", file: "cape_home.png" },
  { name: "cape_menace", file: "cape_menace.png" },
  { name: "cape_twitch", file: "cape_twitch.png" },
  { name: "cape_zombiehorse", file: "cape_zombiehorse.png" },
  { name: "cape_vanillacape", file: "cape_vanillacape.png" },
  { name: "cape_cherry", file: "cape_cherry.png" },
  { name: "cape_pan", file: "cape_pan.png" },
  { name: "cape_founders", file: "cape_founders.png" },
  { name: "cape_migratorcape", file: "cape_migratorcape.png" },
  { name: "cape_yearn", file: "cape_yearn.png" },
  { name: "cape_common", file: "cape_common.png" },
  { name: "cape_15a", file: "cape_15a.png" },
  { name: "cape_builder", file: "cape_builder.png" },
  { name: "cape_tiktok", file: "cape_tiktok.png" },
  { name: "cape_hero", file: "cape_hero.png" },
  { name: "cape_twisted", file: "cape_twisted.png" },
  { name: "cape_mojangoffice", file: "cape_mojangoffice.png" },
  { name: "cape_2011", file: "cape_2011.png" },
  { name: "cape_2012", file: "cape_2012.png" },
  { name: "cape_2013", file: "cape_2013.png" },
  { name: "cape_2015", file: "cape_2015.png" },
  { name: "cape_2016", file: "cape_2016.png" },
  { name: "cape_realms", file: "cape_realms.png" },
  { name: "cape_mcc", file: "cape_mcc.png" },
  { name: "cape_cobalt", file: "cape_cobalt.png" },
  { name: "cape_mojangstudios", file: "cape_mojangstudios.png" },
  { name: "cape_mojang", file: "cape_mojang.png" },
  { name: "cape_mojangold", file: "cape_mojangold.png" },
  { name: "cape_scrolls", file: "cape_scrolls.png" },
  { name: "cape_mojira", file: "cape_mojira.png" },
  { name: "cape_translator", file: "cape_translator.png" },
  { name: "cape_translatorchinese", file: "cape_translatorchinese.png" },
  { name: "cape_translatorjapanese", file: "cape_translatorjapanese.png" },
  { name: "cape_turtle", file: "cape_turtle.png" },
  { name: "cape_prismarine", file: "cape_prismarine.png" },
  { name: "cape_spade", file: "cape_spade.png" },
  { name: "cape_snowman", file: "cape_snowman.png" },
  { name: "cape_db", file: "cape_db.png" },
  { name: "cape_millionth", file: "cape_millionth.png" },
  { name: "cape_birthday", file: "cape_birthday.png" },
  { name: "cape_valentine", file: "cape_valentine.png" },
  { name: "cape_sniffer", file: "cape_sniffer.png" },
  { name: "cape_oxeye", file: "cape_oxeye.png" },
  { name: "cape_document", file: "cape_document.png" },
];

export type GuildEmojiResult = { added: string[]; removed: string[]; existed: number; failed: { name: string; reason: string }[]; slotsFull: string[] };

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** v3: does_* 는 2D 고퀄 그림 — 서버에 예전 픽셀 그림이 있으면 지우고 다시 올린다 (replaced 에 있는 이름은 이미 교체됨) */
export async function uploadGuildEmojis(max = 12, replaced: Set<string> = new Set(), origin = "https://doesmc.xyz", guildId = MFA_DISCORD_GUILD_ID): Promise<GuildEmojiResult> {
  const token = (await doesDiscordEnvAsync()).botToken;
  const result: GuildEmojiResult = { added: [], removed: [], existed: 0, failed: [], slotsFull: [] };
  if (!token) {
    result.failed.push({ name: "-", reason: "DOES 봇 토큰이 없어요" });
    return result;
  }
  const api = (method: string, path: string, body?: unknown) =>
    fetch(`https://discord.com/api/v10${path}`, {
      method,
      headers: body === undefined ? { Authorization: `Bot ${token}` } : { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const listRes = await api("GET", `/guilds/${guildId}/emojis`);
  if (!listRes.ok) {
    result.failed.push({ name: "-", reason: `서버 이모지 목록을 못 읽음 (${listRes.status})` });
    return result;
  }
  const list = (await listRes.json()) as { id: string; name: string }[];
  const have = new Set(list.map((e) => e.name));
  for (const e of list) {
    if (!e.name.startsWith("does_") || replaced.has(e.name) || !GUILD_EMOJIS.some((g) => g.name === e.name)) continue;
    const d = await api("DELETE", `/guilds/${guildId}/emojis/${e.id}`);
    if (d.ok || d.status === 404) {
      have.delete(e.name);
      result.removed.push(e.name);
    } else {
      const j = (await d.json().catch(() => null)) as { message?: string } | null;
      result.failed.push({ name: e.name, reason: `지우기 실패 ${d.status} ${j?.message ?? ""}`.trim() });
    }
  }
  const full = new Set<"static" | "animated">();
  for (const e of GUILD_EMOJIS) {
    if (have.has(e.name)) {
      result.existed += 1;
      continue;
    }
    const kind = e.file.endsWith(".gif") ? "animated" : "static";
    if (result.added.length >= max) break;
    if (full.has(kind)) {
      result.slotsFull.push(e.name);
      continue;
    }
    try {
      const img = await fetch(`${origin}/emoji/${e.file}`);
      if (!img.ok) throw new Error(`그림 ${img.status}`);
      const mime = kind === "animated" ? "image/gif" : "image/png";
      const r = await api("POST", `/guilds/${guildId}/emojis`, { name: e.name, image: `data:${mime};base64,${toBase64(await img.arrayBuffer())}` });
      if (r.ok) {
        result.added.push(e.name);
        continue;
      }
      const j = (await r.json().catch(() => null)) as { code?: number; message?: string; retry_after?: number } | null;
      if (j?.code === 30008) {
        full.add(kind);
        result.slotsFull.push(e.name);
      } else if (r.status === 429) {
        await new Promise((res) => setTimeout(res, Math.min(10_000, (j?.retry_after ?? 2) * 1000)));
        result.failed.push({ name: e.name, reason: "요청 제한(429) — 다음에 다시" });
      } else {
        result.failed.push({ name: e.name, reason: `${r.status} ${j?.message ?? ""}`.trim() });
        if (r.status === 403) break;
      }
    } catch (err) {
      result.failed.push({ name: e.name, reason: String(err) });
    }
  }
  return result;
}
