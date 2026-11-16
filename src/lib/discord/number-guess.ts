/**
 * 숫자 맞추기 — /숫자 로 관리자가 정답을 정해 채널에 시작 패널을 올리고,
 * /맞추기 로 누구나 숫자를 넣는다. 가장 먼저 맞힌 1명이 나오면 정답 이미지와 함께 발표한다.
 */
import {
  container,
  errorPanel,
  mediaGallery,
  MessageFlags,
  plainEphemeral,
  separator,
  textDisplay,
  type DiscordInteraction,
} from "@/lib/discord/components";
import { appEmoji, ensureAppEmojis, reactionEmoji } from "@/lib/discord/app-emojis";
import { isDiscordAdmin } from "@/lib/discord/handlers";
import { discordRest, editChannelMessage, postChannelMessage } from "@/lib/discord/rest";
import { getShopSettings } from "@/lib/store";
import type { Shop } from "@/lib/types";
import { kvGetJson, kvPutJson } from "@/lib/world/kv";

type Game = {
  answer: number;
  min: number | null;
  max: number | null;
  prize: string;
  hostId: string;
  channelId: string;
  messageId: string | null;
  attempts: number;
  startedAt: number;
  winnerId?: string;
  endedAt?: number;
};

const TTL = 14 * 24 * 3600;
const key = (channelId: string) => `numguess:${channelId}`;

function origin() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://vendix.team").replace(/\/$/, "");
}

function rangeText(g: Game) {
  if (g.min != null && g.max != null) return `**${g.min.toLocaleString("ko-KR")} ~ ${g.max.toLocaleString("ko-KR")}** 사이 숫자를 맞혀 보세요.`;
  return "정답 숫자를 맞혀 보세요.";
}

function startPanel(shopName: string, g: Game) {
  const ended = Boolean(g.winnerId);
  return {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [
      container(
        [
          mediaGallery([`${origin()}/brand/number-guess-3d.gif`]),
          textDisplay(`-# ${shopName}`),
          textDisplay(ended ? "## 🔢 숫자 맞추기 종료" : "## 🔢 숫자 맞추기 시작!"),
          textDisplay(
            ended ? `정답 **${g.answer.toLocaleString("ko-KR")}** · 당첨 <@${g.winnerId}>` : rangeText(g),
          ),
          separator(true, 1),
          textDisplay(`**상품** ${g.prize || "-"}`),
          textDisplay(
            ended
              ? `-# 시도 ${g.attempts}번 만에 정답이 나왔어요`
              : `-# 이 채널에 숫자만 보내면 돼요 (${appEmoji("does_check")} 정답 · ${appEmoji("does_cross")} 오답) · 가장 먼저 맞힌 1명 당첨`,
          ),
        ],
        ended ? 0x6b7280 : 0x3b82f6,
      ),
    ],
    allowed_mentions: { parse: [] as string[] },
  };
}

function winPanel(shopName: string, g: Game) {
  return {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [
      container(
        [
          mediaGallery([`${origin()}/brand/number-guess-win-3d.gif`]),
          textDisplay(`-# ${shopName}`),
          textDisplay(`## ${appEmoji("does_party")} 정답이 나왔어요!`),
          textDisplay(`<@${g.winnerId}> 님이 맞혔어요. 축하합니다!\n**정답** ${g.answer.toLocaleString("ko-KR")}`),
          separator(true, 1),
          textDisplay(`**상품** ${g.prize || "-"} — 티켓을 열어 받아 주세요\n-# 다음 게임이 시작될 때까지 채널이 잠겨요`),
          textDisplay(
            `-# ${g.min != null && g.max != null ? `범위 ${g.min.toLocaleString("ko-KR")} ~ ${g.max.toLocaleString("ko-KR")} · ` : ""}시도 ${g.attempts}번`,
          ),
        ],
        0xec4899,
      ),
    ],
    allowed_mentions: { users: g.winnerId ? [g.winnerId] : [] },
  };
}

function intOpt(i: DiscordInteraction, name: string) {
  const v = i.data?.options?.find((o) => o.name === name)?.value;
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
}
function strOpt(i: DiscordInteraction, name: string) {
  const v = i.data?.options?.find((o) => o.name === name)?.value;
  return typeof v === "string" ? v.trim() : "";
}

/** /숫자 숫자 채널 [최소] [최대] [상품] */
export async function handleNumberGuessStart(
  shop: Shop,
  interaction: DiscordInteraction,
  actor: { id: string; roles: string[] },
) {
  if (!isDiscordAdmin(getShopSettings(shop.id), actor.roles, interaction.member?.permissions)) {
    return errorPanel("숫자 맞추기는 관리자만 시작할 수 있어요.", "권한 없음");
  }
  const answer = intOpt(interaction, "숫자");
  const channelId = strOpt(interaction, "채널") || interaction.channel_id || "";
  if (answer == null || !channelId) return errorPanel("정답 숫자와 채널을 정해 주세요.");
  const min = intOpt(interaction, "최소");
  const max = intOpt(interaction, "최대");
  if (min != null && max != null && (min > max || answer < min || answer > max)) {
    return errorPanel("정답이 최소 ~ 최대 범위 안에 있어야 해요.");
  }
  const running = await kvGetJson<Game>(key(channelId));
  if (running && !running.winnerId) {
    return errorPanel(`<#${channelId}> 에 이미 진행 중인 게임이 있어요. 정답이 나오면 새로 시작할 수 있어요.`);
  }
  const game: Game = {
    answer,
    min: min != null && max != null ? min : null,
    max: min != null && max != null ? max : null,
    prize: strOpt(interaction, "상품").slice(0, 200),
    hostId: actor.id,
    channelId,
    messageId: null,
    attempts: 0,
    startedAt: Date.now(),
  };
  // 지난 게임에서 잠근 채널을 다시 연다
  const unlock = await setGuessChannelLocked(channelId, false, shop.id);
  const posted = await postChannelMessage(channelId, startPanel(shop.name, game), shop.id);
  const id = posted.ok ? (posted.json as { id?: string } | null)?.id : null;
  if (!id) return errorPanel("게임을 올리지 못했어요. 봇이 그 채널에 글을 쓸 수 있는지 확인해 주세요.");
  game.messageId = String(id);
  await kvPutJson(key(channelId), game, TTL);
  return plainEphemeral(
    `<#${channelId}> 에 숫자 맞추기를 시작했어요. 정답은 **${answer}** 예요 (본인만 보여요).` +
      (unlock.ok ? "" : "\n-# 채널을 열지 못했어요. 봇에게 '채널 관리' 권한을 주세요."),
  );
}

/** /맞추기 숫자 */
export async function handleNumberGuess(shop: Shop, interaction: DiscordInteraction, actor: { id: string }) {
  const channelId = interaction.channel_id;
  const guess = intOpt(interaction, "숫자");
  if (!channelId || guess == null) return plainEphemeral("숫자를 넣어 주세요.");
  const game = await kvGetJson<Game>(key(channelId));
  if (!game) return plainEphemeral("이 채널에는 진행 중인 숫자 맞추기가 없어요.");
  if (game.winnerId) return plainEphemeral(`이미 끝난 게임이에요. 정답은 **${game.answer}** 였어요.`);
  if (game.min != null && game.max != null && (guess < game.min || guess > game.max)) {
    return plainEphemeral(`${game.min} ~ ${game.max} 사이 숫자만 넣을 수 있어요.`);
  }
  game.attempts += 1;
  if (guess !== game.answer) {
    await kvPutJson(key(channelId), game, TTL);
    return plainEphemeral(`**${guess}** 은(는) 정답이 아니에요. 다시 도전해 보세요!`);
  }
  game.winnerId = actor.id;
  game.endedAt = Date.now();
  await kvPutJson(key(channelId), game, TTL);
  await postChannelMessage(
    channelId,
    {
      ...winPanel(shop.name, game),
      ...(game.messageId ? { message_reference: { message_id: game.messageId, fail_if_not_exists: false } } : {}),
    },
    shop.id,
  );
  if (game.messageId) await editChannelMessage(channelId, game.messageId, startPanel(shop.name, game), shop.id).catch(() => null);
  await setGuessChannelLocked(channelId, true, shop.id);
  return plainEphemeral(`🎉 정답이에요! **${guess}** — 축하합니다!`);
}

const SEND_MESSAGES = BigInt(2048);

/**
 * 채널 잠금/열기 — @everyone 의 '메시지 보내기' 만 바꾸고 다른 권한은 그대로 둔다.
 * 봇에게 '채널 관리'(또는 '역할 관리') 권한이 있어야 한다.
 */
export async function setGuessChannelLocked(channelId: string, locked: boolean, shopId: string) {
  const ch = await discordRest("GET", `/channels/${channelId}`, undefined, shopId).catch(() => null);
  const info = ch?.ok ? (ch.json as { guild_id?: string; permission_overwrites?: { id: string; type: number; allow: string; deny: string }[] }) : null;
  const guildId = info?.guild_id;
  if (!guildId) return { ok: false as const, error: "채널 정보를 못 읽었어요" };
  const cur = info?.permission_overwrites?.find((o) => o.id === guildId);
  let allow = BigInt(cur?.allow ?? "0");
  let deny = BigInt(cur?.deny ?? "0");
  if (locked) {
    deny |= SEND_MESSAGES;
    allow &= ~SEND_MESSAGES;
  } else {
    deny &= ~SEND_MESSAGES;
  }
  const r = await discordRest(
    "PUT",
    `/channels/${channelId}/permissions/${guildId}`,
    { type: 0, allow: allow.toString(), deny: deny.toString() },
    shopId,
  ).catch(() => null);
  if (!r?.ok) console.error("[number-guess] channel lock failed", channelId, locked, r?.status);
  return { ok: Boolean(r?.ok), status: r?.status ?? 0 };
}

function react(channelId: string, messageId: string, emoji: string, shopId: string) {
  return discordRest(
    "PUT",
    `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
    undefined,
    shopId,
  ).catch(() => null);
}

/** 게임 채널에 숫자만 보낸 메시지 (게이트웨이 → server-status op: guess). 맞으면 ✅ + 정답 발표, 틀리면 ❌ */
export async function handleNumberGuessMessage(
  shop: Shop,
  channelId: string,
  messageId: string,
  userId: string,
  guess: number,
) {
  const game = await kvGetJson<Game>(key(channelId));
  if (!game || game.winnerId) return { ok: true, ignored: true };
  await ensureAppEmojis();
  game.attempts += 1;
  const inRange = game.min == null || game.max == null || (guess >= game.min && guess <= game.max);
  if (!inRange || guess !== game.answer) {
    await kvPutJson(key(channelId), game, TTL);
    await react(channelId, messageId, reactionEmoji("does_cross"), shop.id);
    return { ok: true, correct: false };
  }
  game.winnerId = userId;
  game.endedAt = Date.now();
  await kvPutJson(key(channelId), game, TTL);
  await react(channelId, messageId, reactionEmoji("does_check"), shop.id);
  await postChannelMessage(
    channelId,
    { ...winPanel(shop.name, game), message_reference: { message_id: messageId, fail_if_not_exists: false } },
    shop.id,
  );
  if (game.messageId) await editChannelMessage(channelId, game.messageId, startPanel(shop.name, game), shop.id).catch(() => null);
  // 정답이 나오면 관리자가 새로 시작할 때까지 일반 사용자는 채팅을 못 치게 막는다
  await setGuessChannelLocked(channelId, true, shop.id);
  return { ok: true, correct: true };
}
