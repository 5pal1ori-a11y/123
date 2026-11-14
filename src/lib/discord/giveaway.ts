import {
  actionRow,
  button,
  cid,
  container,
  MessageFlags,
  mediaGallery,
  plainEphemeral,
  separator,
  textDisplay,
  v2Message,
  type DiscordInteraction,
} from "@/lib/discord/components";
import { BANNER_PATHS } from "@/lib/gif/banners";
import { isDiscordAdmin } from "@/lib/discord/handlers";
import { editChannelMessage, postChannelMessage } from "@/lib/discord/rest";
import { getShopBySlug, getShopSettings } from "@/lib/store";
import type { Shop } from "@/lib/types";
import type { Giveaway } from "@/lib/discord/giveaway-types";

const HOUR = 60 * 60 * 1000;

type HubStub = { fetch(input: string, init?: RequestInit): Promise<Response> };
type HubNamespace = { idFromName(name: string): unknown; get(id: unknown): HubStub };

async function hub(op: string, body: Record<string, unknown>) {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env } = await getCloudflareContext({ async: true });
  const ns = (env as { GIVEAWAY?: HubNamespace }).GIVEAWAY;
  if (!ns) throw new Error("GIVEAWAY binding missing");
  const res = await ns.get(ns.idFromName("main")).fetch("https://giveaway-hub/", {
    method: "POST",
    body: JSON.stringify({ op, ...body }),
  });
  return { ok: res.ok, status: res.status, data: (await res.json()) as Record<string, unknown> };
}

function giveawayMessage(g: Giveaway) {
  const end = Math.floor(g.endsAt / 1000);
  const origin = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://vendix.team").replace(/\/$/, "");
  const banner = `${origin}${g.ended ? BANNER_PATHS.giveawayEnd : BANNER_PATHS.giveaway}`;
  const winners = g.ended
    ? g.winnerIds.length
      ? g.winnerIds.map((id) => `<@${id}>`).join(" ")
      : "참여자가 없어 당첨자가 없어요"
    : "추첨 전";
  const kids: unknown[] = [
    mediaGallery([banner]),
    textDisplay(`-# ${g.ended ? "종료된" : "진행 중인"} Giveaway`),
    textDisplay(`## 🎁 ${g.prize}`),
  ];
  if (g.description) kids.push(textDisplay(g.description));
  kids.push(
    separator(true, 1),
    textDisplay(
      [
        `**당첨 인원** ${g.winners}명`,
        `**참여자** ${g.entrants.length}명`,
        `**마감** <t:${end}:F>${g.ended ? "" : ` (<t:${end}:R>)`}`,
        `**당첨자** ${winners}`,
        `**주최** <@${g.hostId}>`,
      ].join("\n"),
    ),
    separator(true, 1),
    textDisplay(
      g.ended
        ? "-# 당첨자는 이 채널에서 멘션으로 발표돼요 · 스태프는 DM으로 결제·계정 정보를 요구하지 않아요"
        : "-# 버튼을 다시 누르면 참여를 취소할 수 있어요 · 마감 시각에 자동으로 추첨해요",
    ),
    actionRow(
      button({
        label: g.ended ? "종료됨" : "참여하기",
        emoji: "🎉",
        customId: cid(g.shopSlug, "gw_join", g.id),
        disabled: g.ended,
      }),
    ),
  );
  return {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [container(kids, g.ended ? 0x57f287 : 0xfee75c)],
    allowed_mentions: { parse: [] as string[] },
  };
}

function giveawayId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 12);
}

export async function handleGiveawayCreate(
  shop: Shop,
  interaction: DiscordInteraction,
  actor: { id: string; roles: string[] },
  opts: { prize: string; winners: number; hours: number; description: string; channelId: string },
) {
  if (!interaction.guild_id) return plainEphemeral("서버에서만 사용할 수 있어요.");
  if (!isDiscordAdmin(getShopSettings(shop.id), actor.roles, interaction.member?.permissions)) {
    return plainEphemeral("관리자만 사용할 수 있어요.");
  }
  const prize = opts.prize.trim().slice(0, 100);
  const winners = Math.min(50, Math.max(1, Math.floor(opts.winners) || 1));
  const hours = Math.min(336, Math.max(1, Math.floor(opts.hours) || 1));
  if (!prize) return plainEphemeral("경품을 입력해 주세요.");
  if (!opts.channelId) return plainEphemeral("올릴 채널을 찾지 못했어요.");

  const now = Date.now();
  const g: Giveaway = {
    id: giveawayId(),
    shopSlug: shop.slug,
    guildId: interaction.guild_id,
    channelId: opts.channelId,
    messageId: null,
    prize,
    description: opts.description.trim().slice(0, 1000),
    winners,
    hostId: actor.id,
    createdAt: now,
    endsAt: now + hours * HOUR,
    entrants: [],
    ended: false,
    winnerIds: [],
    renderedAt: now,
  };

  const posted = await postChannelMessage(g.channelId, giveawayMessage(g), shop.id);
  const messageId = (posted.json as { id?: string } | null)?.id;
  if (!posted.ok || !messageId) {
    return plainEphemeral(`<#${g.channelId}> 에 이벤트를 올리지 못했어요. 봇에게 그 채널의 메시지 보내기 권한이 있는지 확인해 주세요.`);
  }
  g.messageId = messageId;
  const created = await hub("create", { giveaway: g });
  if (!created.ok) {
    await editChannelMessage(g.channelId, messageId, v2Message([textDisplay("이벤트를 만들지 못했어요.")]), shop.id);
    return plainEphemeral("이벤트를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  const end = Math.floor(g.endsAt / 1000);
  return plainEphemeral(`<#${g.channelId}> 에 이벤트를 올렸어요. <t:${end}:F> (<t:${end}:R>) 에 자동으로 추첨해요.`);
}

export async function handleGiveawayJoin(shop: Shop, giveawayId: string, userId: string) {
  const res = await hub("join", { id: giveawayId, userId });
  if (!res.ok) return plainEphemeral("이벤트를 찾지 못했어요.");
  const g = res.data.giveaway as Giveaway;
  if (res.data.ended) return plainEphemeral("이미 끝난 이벤트예요.");
  if (res.data.refresh && g.messageId) {
    const { scheduleDiscordBackground } = await import("@/lib/discord/schedule");
    scheduleDiscordBackground(editChannelMessage(g.channelId, g.messageId, giveawayMessage(g), shop.id));
  }
  const count = Number(res.data.count) || 0;
  return res.data.joined
    ? plainEphemeral(`**${g.prize}** 이벤트에 참여했어요! 행운을 빌어요 🍀 (현재 ${count}명)\n-# 버튼을 한 번 더 누르면 참여가 취소돼요.`)
    : plainEphemeral(`참여를 취소했어요. (현재 ${count}명)`);
}

function pickWinners(entrants: string[], count: number) {
  const pool = [...entrants];
  const rand = new Uint32Array(pool.length);
  crypto.getRandomValues(rand);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = rand[i] % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/** Durable Object 알람이 마감 시각에 호출 — 추첨 후 원래 메시지를 고치고 당첨 발표를 올린다 */
export async function finishGiveaway(id: string) {
  const current = await hub("get", { id });
  if (!current.ok) return { ok: false as const, error: "not_found" };
  const g0 = current.data as unknown as Giveaway;
  if (g0.ended) return { ok: true as const, already: true };

  const done = await hub("finish", { id, winnerIds: pickWinners(g0.entrants, g0.winners) });
  if (!done.ok) return { ok: false as const, error: "finish_failed" };
  if (done.data.already) return { ok: true as const, already: true };
  const g = done.data.giveaway as Giveaway;
  const shop = getShopBySlug(g.shopSlug);

  if (g.messageId) await editChannelMessage(g.channelId, g.messageId, giveawayMessage(g), shop?.id);
  const announce = g.winnerIds.length
    ? `## 🎉 당첨을 축하합니다!\n**${g.prize}**\n${g.winnerIds.map((uid) => `<@${uid}>`).join(" ")}\n-# 주최자 <@${g.hostId}> 에게 연락해 경품을 받아 가세요.`
    : `## 이벤트 종료\n**${g.prize}** 이벤트에 참여자가 없어 당첨자가 없어요.`;
  await postChannelMessage(
    g.channelId,
    {
      ...v2Message([textDisplay(announce)]),
      allowed_mentions: { users: g.winnerIds },
      ...(g.messageId ? { message_reference: { message_id: g.messageId, fail_if_not_exists: false } } : {}),
    },
    shop?.id,
  );
  return { ok: true as const, already: false, winners: g.winnerIds.length };
}
