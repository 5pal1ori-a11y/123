import {
  actionRow,
  actorFromInteraction,
  button,
  ButtonStyle,
  container,
  InteractionResponseType,
  InteractionType,
  mediaGallery,
  MessageFlags,
  modalFieldValue,
  separator,
  showModal,
  stringSelect,
  textDisplay,
  textInput,
  TextInputStyle,
  type DiscordInteraction,
} from "@/lib/discord/components";
import { ticketOrigin, ticketPanelUrl } from "@/lib/domain";
import { registerTicketGuildCommands } from "@/lib/ticket-bot/rest";
import { closeTicketFlow, openTicketForUser } from "@/lib/ticket-bot/service";
import {
  canCloseTicket,
  getTicketById,
  getTicketGuild,
  initTicketStore,
  persistTicketStore,
  registerTicketGuild,
} from "@/lib/ticket-bot/store";
import type { TicketCloseReason } from "@/lib/ticket-bot/types";

function isGuildAdmin(permissions?: string) {
  if (!permissions) return false;
  try {
    const p = BigInt(permissions);
    const ADMINISTRATOR = BigInt(1) << BigInt(3);
    const MANAGE_GUILD = BigInt(1) << BigInt(5);
    return (p & ADMINISTRATOR) === ADMINISTRATOR || (p & MANAGE_GUILD) === MANAGE_GUILD;
  } catch {
    return false;
  }
}

function ephemeralV2(kids: unknown[]) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: MessageFlags.EPHEMERAL | MessageFlags.IS_COMPONENTS_V2,
      components: [container(kids)],
    },
  };
}

function publicV2(kids: unknown[]) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: MessageFlags.IS_COMPONENTS_V2,
      components: [container(kids)],
    },
  };
}

function errorV2(message: string) {
  return ephemeralV2([textDisplay("## 오류"), separator(true, 1), textDisplay(message)]);
}

function parseTkCid(customId: string) {
  const parts = customId.split("|");
  if (parts[0] !== "tk" || parts.length < 3) return null;
  return {
    guildId: parts[1] || "",
    action: parts[2] || "",
    payload: parts.slice(3).join("|"),
  };
}

function parseCloseReason(raw: string): TicketCloseReason | null {
  const v = raw.trim().toLowerCase();
  if (v === "resolved" || v === "해결" || v === "해결됨") return "resolved";
  if (v === "spam" || v === "스팸") return "spam";
  if (v === "duplicate" || v === "중복") return "duplicate";
  if (v === "other" || v === "기타") return "other";
  return null;
}

function parseCsat(raw: string): 1 | 2 | 3 | 4 | 5 | null {
  const n = Number(raw.trim());
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) return n;
  return null;
}

export async function handleTicketBotInteraction(interaction: DiscordInteraction) {
  await initTicketStore({ force: true });

  if (interaction.type === InteractionType.PING) {
    return { type: InteractionResponseType.PONG };
  }

  const actor = actorFromInteraction(interaction);
  if (!actor) return errorV2("사용자를 확인할 수 없어요.");

  if (interaction.type === InteractionType.MODAL_SUBMIT) {
    const customId = interaction.data?.custom_id ?? "";
    const parsed = parseTkCid(customId);
    if (!parsed || parsed.action !== "close_modal") {
      return errorV2("잘못된 모달이에요.");
    }
    const guild = getTicketGuild(parsed.guildId);
    if (!guild || !guild.enabled) return errorV2("티켓봇이 등록되지 않았거나 꺼져 있어요.");

    const ticket = getTicketById(parsed.payload);
    if (!ticket || ticket.guildId !== guild.guildId) {
      return errorV2("티켓을 찾을 수 없어요.");
    }
    if (!canCloseTicket(guild, actor.id, actor.roles, ticket.openerId)) {
      return errorV2("티켓을 닫을 권한이 없어요.");
    }

    const reasonRaw = modalFieldValue(interaction, "reason");
    const csatRaw = modalFieldValue(interaction, "csat");
    const closeReason = parseCloseReason(reasonRaw) || "other";
    const csat = parseCsat(csatRaw);

    const closed = await closeTicketFlow({
      ticketId: ticket.id,
      closedById: actor.id,
      closedByLabel: `<@${actor.id}>`,
      closeReason,
      csat,
    });
    if (!closed.ok) return errorV2(closed.error);

    return ephemeralV2([
      textDisplay("## 티켓이 닫혔습니다"),
      separator(true, 1),
      textDisplay(`트랜스크립트\n${closed.url}`),
    ]);
  }

  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const customId = interaction.data?.custom_id ?? "";
    const parsed = parseTkCid(customId);
    if (!parsed) return errorV2("잘못된 상호작용이에요.");

    const guild = getTicketGuild(parsed.guildId);
    if (!guild || !guild.enabled) return errorV2("티켓봇이 등록되지 않았거나 꺼져 있어요.");

    if (parsed.action === "open") {
      const topicId = interaction.data?.values?.[0] || parsed.payload;
      const topic = guild.topics.find((t) => t.id === topicId);
      if (!topic) return errorV2("주제를 찾을 수 없어요. 웹패널에서 주제를 확인해 주세요.");

      const openerName = actor.username;
      const result = await openTicketForUser({
        guild,
        topic,
        openerId: actor.id,
        openerName,
      });
      if (!result.ok) return errorV2(result.error);

      return ephemeralV2([
        textDisplay("## 티켓이 생성되었습니다"),
        separator(true, 1),
        textDisplay(`채널: <#${result.channelId}>\n주제: **${topic.name}**`),
      ]);
    }

    if (parsed.action === "close") {
      const ticket = getTicketById(parsed.payload);
      if (!ticket || ticket.guildId !== guild.guildId) {
        return errorV2("티켓을 찾을 수 없어요.");
      }
      if (!canCloseTicket(guild, actor.id, actor.roles, ticket.openerId)) {
        return errorV2("티켓을 닫을 권한이 없어요.");
      }

      return showModal({
        customId: `tk|${parsed.guildId}|close_modal|${ticket.id}`,
        title: "티켓 닫기",
        inputs: [
          textInput({
            customId: "reason",
            label: "종료 사유 (해결/스팸/중복/기타)",
            placeholder: "해결",
            required: true,
            maxLength: 20,
            value: "해결",
          }),
          textInput({
            customId: "csat",
            label: "만족도 1~5 (선택)",
            style: TextInputStyle.SHORT,
            placeholder: "5",
            required: false,
            maxLength: 1,
          }),
        ],
      });
    }

    return errorV2("지원하지 않는 동작이에요.");
  }

  if (interaction.type !== InteractionType.APPLICATION_COMMAND) {
    return errorV2("지원하지 않는 상호작용입니다.");
  }

  const name = interaction.data?.name;
  const guildId = interaction.guild_id;
  if (!guildId) return errorV2("서버에서만 사용할 수 있어요.");

  if (name === "등록") {
    if (!isGuildAdmin(interaction.member?.permissions)) {
      return errorV2("관리자 권한이 필요합니다.");
    }
    const guildName =
      (interaction as { guild?: { name?: string } }).guild?.name ||
      `서버-${guildId.slice(-4)}`;
    const { guild, created } = registerTicketGuild({
      guildId,
      guildName,
      registeredBy: actor.id,
    });
    await persistTicketStore();
    const reg = await registerTicketGuildCommands(guildId);
    return ephemeralV2([
      textDisplay(created ? "## 티켓봇 등록 완료" : "## 티켓봇 재등록 완료"),
      separator(true, 1),
      textDisplay(
        `서버: **${guild.guildName}**\n웹패널: ${ticketOrigin()}\n\n웹패널은 **Discord 서버 소유자** 계정으로만 로그인할 수 있어요.`,
      ),
      textDisplay(
        reg.ok
          ? "-# `/등록` `/티켓패널` `/티켓웹` 등록됨"
          : `-# 명령 등록 경고: ${reg.error}`,
      ),
      actionRow(
        button({
          label: "웹패널 열기",
          style: ButtonStyle.LINK,
          url: ticketOrigin(),
        }),
      ),
    ]);
  }

  if (name === "티켓웹") {
    if (!isGuildAdmin(interaction.member?.permissions)) {
      return errorV2("관리자 권한이 필요합니다.");
    }
    const guild = getTicketGuild(guildId);
    if (!guild) return errorV2("먼저 `/등록`으로 서버를 등록해 주세요.");
    return ephemeralV2([
      textDisplay("## 티켓 웹패널"),
      separator(true, 1),
      textDisplay(
        `서버: **${guild.guildName}**\n${ticketOrigin()}\n\n**Discord로 로그인** 후 소유한 등록 서버를 선택하세요.`,
      ),
      actionRow(
        button({
          label: "웹패널 열기",
          style: ButtonStyle.LINK,
          url: ticketOrigin(),
        }),
      ),
    ]);
  }

  if (name === "티켓패널") {
    if (!isGuildAdmin(interaction.member?.permissions)) {
      return errorV2("관리자 권한이 필요합니다.");
    }
    const guild = getTicketGuild(guildId);
    if (!guild) return errorV2("먼저 `/등록`으로 서버를 등록해 주세요.");
    if (!guild.enabled) return errorV2("티켓봇이 비활성화되어 있어요.");
    if (!guild.topics.length) return errorV2("웹패널에서 주제를 하나 이상 추가해 주세요.");
    if (!guild.ticketCategoryId) {
      return errorV2("웹패널 → 설정에서 티켓 생성 카테고리를 지정해 주세요.");
    }

    const kids: unknown[] = [];
    if (guild.panelBannerUrl) {
      kids.push(mediaGallery([guild.panelBannerUrl]));
      kids.push(separator(true, 1));
    }
    kids.push(textDisplay(`## ${guild.panelTitle}`));
    kids.push(separator(true, 1));
    kids.push(textDisplay(guild.panelDescription));
    kids.push(separator(true, 1));
    kids.push(
      actionRow(
        stringSelect({
          customId: `tk|${guildId}|open`,
          placeholder: "주제를 선택하세요",
          options: guild.topics.map((t) => ({
            label: t.name,
            value: t.id,
            description: t.description || undefined,
          })),
        }),
      ),
    );

    return publicV2(kids);
  }

  return errorV2("알 수 없는 명령이에요.");
}
