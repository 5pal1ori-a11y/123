import {
  actionRow,
  button,
  cid,
  ComponentType,
  container,
  mediaGallery,
  MessageFlags,
  modalFieldValue,
  plainEphemeral,
  separator,
  showModal,
  stringSelect,
  textDisplay,
  textInput,
  v2Ephemeral,
  v2Update,
  type DiscordInteraction,
} from "@/lib/discord/components";
import { doesDiscordEnvAsync, isMfaShopSlug } from "@/lib/discord/does-env";
import { isDiscordAdmin } from "@/lib/discord/handlers";
import { scheduleDiscordBackground } from "@/lib/discord/schedule";
import { getDiscordCredentials, getShopSettings } from "@/lib/store";
import { postTicketChannelMessage, withTicketBotToken } from "@/lib/ticket-bot/rest";
import {
  appendTicketAudit,
  getTicketGuild,
  initTicketStore,
  persistTicketStore,
  registerTicketGuild,
  updateTicketGuild,
} from "@/lib/ticket-bot/store";
import type { TicketGuild } from "@/lib/ticket-bot/types";
import type { Shop } from "@/lib/types";

/** /티켓설정 · /티켓패널 — 티켓봇(src/lib/ticket-bot)의 저장소 · 채널 생성 로직을 DOES 봇 토큰으로 그대로 쓴다 */

const MAX_TOPICS = 25;
const MAX_ROLES = 10;

export const TICKET_SETTING_ACTIONS = new Set(["tk_cat", "tk_roles", "tk_log", "tk_topic_del", "tk_topic_add", "tk_topic_modal", "tk_post", "tk_ai"]);

function kickGateway() {
  scheduleDiscordBackground(import("@/lib/discord/ticket-ai").then(({ kickTicketGateway }) => kickTicketGateway()));
}

type Option = { name: string; type: number; value?: string | number | boolean };

function opt(opts: Option[], name: string) {
  const v = opts.find((o) => o.name === name)?.value;
  return v === undefined || v === null ? "" : String(v).trim();
}

export async function botTokenForShop(shop: Shop) {
  if (isMfaShopSlug(shop.slug)) return (await doesDiscordEnvAsync()).botToken;
  return getDiscordCredentials(shop.id).botToken;
}

/** tk| 버튼 · 셀렉트 · 모달 — 티켓봇 핸들러를 이 상점 봇 토큰으로 실행 */
export async function handleTicketComponent(shop: Shop, interaction: DiscordInteraction) {
  const token = await botTokenForShop(shop);
  const { handleTicketBotInteraction } = await import("@/lib/ticket-bot/router");
  const result = await withTicketBotToken(token, () => handleTicketBotInteraction(interaction));
  if (isMfaShopSlug(shop.slug)) kickGateway();
  return result;
}

function ensureGuild(shop: Shop, guildId: string, actorId: string) {
  const guild = getTicketGuild(guildId) ?? registerTicketGuild({ guildId, guildName: "DOES", registeredBy: actorId }).guild;
  if (!guild.linkedShopSlug) updateTicketGuild(guildId, { linkedShopSlug: shop.slug });
  return guild;
}

function isAdmin(shop: Shop, interaction: DiscordInteraction, roles: string[]) {
  return isDiscordAdmin(getShopSettings(shop.id), roles, interaction.member?.permissions);
}

function channelPick(customId: string, placeholder: string, types: number[], current: string | null, optional: boolean) {
  return {
    type: ComponentType.CHANNEL_SELECT,
    custom_id: customId,
    placeholder,
    channel_types: types,
    min_values: optional ? 0 : 1,
    max_values: 1,
    ...(current ? { default_values: [{ id: current, type: "channel" }] } : {}),
  };
}

function settingsComponents(shopSlug: string, guild: TicketGuild, notice?: string) {
  // Components V2 텍스트 합계 4000자 제한 — 주제 설명이 길면 패널 전체가 거부된다
  const topicList = guild.topics
    .map((t) => `• **${t.name}**${t.description ? ` — ${t.description.slice(0, 100)}` : ""}`)
    .join("\n");
  const topics = guild.topics.length
    ? topicList.length > 2500 ? `${topicList.slice(0, 2500)}…` : topicList
    : "아직 없어요 — 아래 **주제 추가** 를 눌러 주세요.";
  const kids: unknown[] = [
    textDisplay("## 티켓 설정"),
    textDisplay(
      [
        `**카테고리** ${guild.ticketCategoryId ? `<#${guild.ticketCategoryId}>` : "미설정"}`,
        `**멘션 역할** ${guild.mentionRoleIds.length ? guild.mentionRoleIds.map((id) => `<@&${id}>`).join(" ") : "없음"}`,
        `**로그 채널** ${guild.logChannelId ? `<#${guild.logChannelId}>` : "없음"}`,
        `**AI 안내** ${guild.aiEnabled ? "켜짐 — 유저가 글을 쓰면 AI가 먼저 답하고, 관리자가 답하면 그 티켓은 꺼져요" : "꺼짐"}`,
      ].join("\n"),
    ),
    separator(true, 1),
    textDisplay(`**주제 (${guild.topics.length}/${MAX_TOPICS})**\n${topics}`),
  ];
  if (notice) kids.push(separator(true, 1), textDisplay(notice));
  kids.push(
    separator(true, 1),
    actionRow(channelPick(cid(shopSlug, "tk_cat"), "티켓 채널이 만들어질 카테고리", [4], guild.ticketCategoryId, false)),
    actionRow({
      type: ComponentType.ROLE_SELECT,
      custom_id: cid(shopSlug, "tk_roles"),
      placeholder: "멘션 역할 (여러 개 선택 · 빼려면 선택 해제)",
      min_values: 0,
      max_values: MAX_ROLES,
      default_values: guild.mentionRoleIds.slice(0, MAX_ROLES).map((id) => ({ id, type: "role" })),
    }),
    actionRow(channelPick(cid(shopSlug, "tk_log"), "닫힌 티켓 기록을 남길 로그 채널 (선택)", [0], guild.logChannelId, true)),
  );
  if (guild.topics.length) {
    kids.push(
      actionRow(
        stringSelect({
          customId: cid(shopSlug, "tk_topic_del"),
          placeholder: "삭제할 주제 선택",
          options: guild.topics.map((t) => ({ label: t.name, value: t.id, description: t.description || undefined })),
        }),
      ),
    );
  }
  kids.push(
    actionRow(
      button({ label: "주제 추가", emoji: "➕", customId: cid(shopSlug, "tk_topic_add"), disabled: guild.topics.length >= MAX_TOPICS }),
      button({ label: "이 채널에 패널 올리기", emoji: "📨", customId: cid(shopSlug, "tk_post") }),
      button({ label: guild.aiEnabled ? "AI 안내 끄기" : "AI 안내 켜기", emoji: "🤖", customId: cid(shopSlug, "tk_ai") }),
    ),
  );
  kids.push(textDisplay("-# 멘션 역할은 티켓이 열릴 때 호출되고, 티켓 채널을 보고 닫을 수 있어요. 제목·설명·배너를 바꾸려면 `/티켓패널` 을 쓰세요."));
  return [container(kids)];
}

export async function handleTicketSettingsCommand(shop: Shop, interaction: DiscordInteraction, actorId: string, roles: string[]) {
  const guildId = interaction.guild_id;
  if (!guildId) return plainEphemeral("서버에서만 사용할 수 있어요.");
  if (!isAdmin(shop, interaction, roles)) return plainEphemeral("관리자만 사용할 수 있어요.");
  await initTicketStore({ force: true });
  const guild = ensureGuild(shop, guildId, actorId);
  return v2Ephemeral(settingsComponents(shop.slug, guild));
}

/** 설정 패널의 셀렉트 · 버튼 · 주제 모달 — 패널을 그 자리에서 고쳐 그린다 */
export async function handleTicketSettingsAction(
  shop: Shop,
  interaction: DiscordInteraction,
  actor: { id: string; roles: string[] },
  action: string,
) {
  const guildId = interaction.guild_id;
  if (!guildId) return plainEphemeral("서버에서만 사용할 수 있어요.");
  if (!isAdmin(shop, interaction, actor.roles)) return plainEphemeral("관리자만 사용할 수 있어요.");

  if (action === "tk_topic_add") {
    return showModal({
      customId: cid(shop.slug, "tk_topic_modal"),
      title: "티켓 주제 추가",
      inputs: [
        textInput({ customId: "name", label: "주제 이름", placeholder: "예: 구매 문의", maxLength: 50 }),
        textInput({ customId: "desc", label: "설명 (선택)", placeholder: "셀렉트 메뉴에 작게 보이는 설명", required: false, maxLength: 100 }),
      ],
    });
  }

  await initTicketStore({ force: true });
  const guild = ensureGuild(shop, guildId, actor.id);
  const values = interaction.data?.values ?? [];
  let notice = "";

  if (action === "tk_cat") {
    const id = values[0];
    if (id) {
      updateTicketGuild(guildId, { ticketCategoryId: id });
      notice = `티켓 채널이 <#${id}> 카테고리 안에 만들어져요.`;
    }
  } else if (action === "tk_roles") {
    const ids = [...new Set(values)].slice(0, MAX_ROLES);
    updateTicketGuild(guildId, { mentionRoleIds: ids, closeRoleIds: ids });
    notice = ids.length ? `멘션 역할을 ${ids.length}개로 저장했어요.` : "멘션 역할을 모두 뺐어요.";
  } else if (action === "tk_log") {
    const id = values[0] ?? null;
    updateTicketGuild(guildId, { logChannelId: id });
    notice = id ? `닫힌 티켓 기록이 <#${id}> 에 남아요.` : "로그 채널을 껐어요.";
  } else if (action === "tk_topic_del") {
    const target = guild.topics.find((t) => t.id === values[0]);
    if (!target) notice = "그 주제를 찾지 못했어요.";
    else if (guild.topics.length <= 1) notice = "주제는 최소 1개는 있어야 해요. 다른 주제를 먼저 추가해 주세요.";
    else {
      updateTicketGuild(guildId, { topics: guild.topics.filter((t) => t.id !== target.id) });
      notice = `주제 **${target.name}** 을(를) 삭제했어요.`;
    }
  } else if (action === "tk_topic_modal") {
    const name = modalFieldValue(interaction, "name").trim().slice(0, 50);
    if (!name) notice = "주제 이름을 입력해 주세요.";
    else if (guild.topics.length >= MAX_TOPICS) notice = `주제는 최대 ${MAX_TOPICS}개까지예요.`;
    else if (guild.topics.some((t) => t.name === name)) notice = "같은 이름의 주제가 이미 있어요.";
    else {
      const id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      const description = modalFieldValue(interaction, "desc").trim().slice(0, 100);
      updateTicketGuild(guildId, { topics: [...guild.topics, { id, name, description, emoji: null }] });
      notice = `주제 **${name}** 을(를) 추가했어요.`;
    }
  } else if (action === "tk_post") {
    const posted = await postTicketPanel(shop, guildId, interaction.channel_id ?? "", actor.id, {});
    notice = posted.message;
  } else if (action === "tk_ai") {
    const on = !guild.aiEnabled;
    updateTicketGuild(guildId, { aiEnabled: on });
    notice = on
      ? "AI 안내를 켰어요. 새 티켓부터 AI가 먼저 인사하고 답해요."
      : "AI 안내를 껐어요. 이제 티켓에서 AI가 답하지 않아요.";
  }

  if (action !== "tk_post" && notice) {
    appendTicketAudit({ guildId, actor: actor.id, action: `discord.${action}`, detail: notice });
    await persistTicketStore();
  }
  if (action === "tk_ai") kickGateway();
  return v2Update(settingsComponents(shop.slug, getTicketGuild(guildId) ?? guild, notice ? `-# ${notice}` : undefined));
}

async function postTicketPanel(
  shop: Shop,
  guildId: string,
  channelId: string,
  actorId: string,
  overrides: { title?: string; description?: string; image?: string },
) {
  await initTicketStore({ force: true });
  const guild = ensureGuild(shop, guildId, actorId);
  if (!guild.ticketCategoryId) return { ok: false, message: "먼저 `/티켓설정` 에서 티켓 채널이 만들어질 카테고리를 골라 주세요." };
  if (!guild.topics.length) return { ok: false, message: "먼저 `/티켓설정` 에서 주제를 하나 이상 추가해 주세요." };
  if (!channelId) return { ok: false, message: "올릴 채널을 찾지 못했어요." };

  const { title, description, image } = overrides;
  if (title || description || image || !guild.enabled) {
    updateTicketGuild(guildId, {
      enabled: true,
      ...(title ? { panelTitle: title } : {}),
      ...(description ? { panelDescription: description } : {}),
      ...(image ? { panelBannerUrl: /^https?:\/\//i.test(image) ? image : null } : {}),
    });
  }
  await persistTicketStore();
  const g = getTicketGuild(guildId) ?? guild;

  const kids: unknown[] = [];
  // 배너를 따로 정하지 않았으면 기본 티켓 이미지
  const origin = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://vendix.team").replace(/\/$/, "");
  kids.push(mediaGallery([g.panelBannerUrl || `${origin}/brand/ticket.png`]));
  kids.push(textDisplay(`## ${g.panelTitle}`), separator(true, 1), textDisplay(g.panelDescription), separator(true, 1));
  kids.push(
    actionRow(
      stringSelect({
        customId: `tk|${guildId}|open`,
        placeholder: "문의할 주제를 선택하세요",
        options: g.topics.map((t) => ({ label: t.name, value: t.id, description: t.description || undefined })),
      }),
    ),
  );

  const token = await botTokenForShop(shop);
  const posted = await withTicketBotToken(token, () =>
    postTicketChannelMessage(channelId, { flags: MessageFlags.IS_COMPONENTS_V2, components: [container(kids)] }),
  );
  if (!posted.ok) {
    return { ok: false, message: `<#${channelId}> 에 패널을 올리지 못했어요. 봇에게 그 채널의 메시지 보내기 권한이 있는지 확인해 주세요.` };
  }
  return { ok: true, message: `<#${channelId}> 에 티켓 패널을 올렸어요. 유저가 주제를 고르면 전용 채널이 만들어져요.` };
}

export async function handleTicketPanelCommand(shop: Shop, interaction: DiscordInteraction, actorId: string, roles: string[]) {
  const guildId = interaction.guild_id;
  if (!guildId) return plainEphemeral("서버에서만 사용할 수 있어요.");
  if (!isAdmin(shop, interaction, roles)) return plainEphemeral("관리자만 사용할 수 있어요.");
  const options = (interaction.data?.options as Option[] | undefined) ?? [];
  const result = await postTicketPanel(shop, guildId, opt(options, "채널") || interaction.channel_id || "", actorId, {
    title: opt(options, "제목"),
    description: opt(options, "설명"),
    image: opt(options, "이미지"),
  });
  return plainEphemeral(result.message);
}
