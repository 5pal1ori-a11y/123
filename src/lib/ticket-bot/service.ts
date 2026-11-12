import { ticketTranscriptAccessToken } from "@/lib/auth";
import {
  actionRow,
  button,
  ButtonStyle,
  container,
  MessageFlags,
  separator,
  textDisplay,
} from "@/lib/discord/components";
import { ticketTranscriptUrl } from "@/lib/domain";
import {
  createTicketChannel,
  deleteTicketChannel,
  fetchChannelMessages,
  listTicketGuildChannels,
  PERM_ALLOW_NONE,
  PERM_DENY_ALL,
  PERM_VIEW_SEND,
  postTicketChannelMessage,
  ticketBotRest,
} from "@/lib/ticket-bot/rest";
import {
  closeTicketRecord,
  createTicketRecord,
  findOpenTicket,
  getTicketById,
  getTicketGuild,
  isNonTicketChannelName,
  listTickets,
  persistTicketStore,
  removeOpenTicketRecord,
  upsertOpenTicketFromChannel,
} from "@/lib/ticket-bot/store";
import {
  sanitizeChannelName,
  TICKET_CLOSE_REASONS,
  type TicketCloseReason,
  type TicketGuild,
  type TicketTopic,
} from "@/lib/ticket-bot/types";

function everyoneDeny(guildId: string) {
  return {
    id: guildId,
    type: 0 as const,
    allow: PERM_ALLOW_NONE,
    deny: PERM_VIEW_SEND,
  };
}

function roleAllow(roleId: string) {
  return {
    id: roleId,
    type: 0 as const,
    allow: PERM_VIEW_SEND,
    deny: PERM_DENY_ALL,
  };
}

function memberAllow(userId: string) {
  return {
    id: userId,
    type: 1 as const,
    allow: PERM_VIEW_SEND,
    deny: PERM_DENY_ALL,
  };
}

export async function openTicketForUser(input: {
  guild: TicketGuild;
  topic: TicketTopic;
  openerId: string;
  openerName: string;
}) {
  if (input.guild.blacklistUserIds.includes(input.openerId)) {
    return {
      ok: false as const,
      error: "블랙리스트에 등록되어 티켓을 열 수 없어요.",
    };
  }

  const existing = findOpenTicket(input.guild.guildId, input.openerId, input.topic.id);
  if (existing) {
    return {
      ok: false as const,
      error: `이미 열린 티켓이 있어요: <#${existing.channelId}>`,
      ticket: existing,
    };
  }

  if (!input.guild.ticketCategoryId) {
    return {
      ok: false as const,
      error: "웹패널에서 티켓 생성 카테고리를 먼저 설정해 주세요.",
    };
  }

  const channelName = sanitizeChannelName(input.topic.name, input.openerName);
  const botUserId = await getBotUserId();
  const overwrites = [
    everyoneDeny(input.guild.guildId),
    memberAllow(input.openerId),
    ...(botUserId ? [memberAllow(botUserId)] : []),
    ...input.guild.closeRoleIds.map(roleAllow),
  ];

  const created = await createTicketChannel({
    guildId: input.guild.guildId,
    name: channelName,
    parentId: input.guild.ticketCategoryId,
    topic: `${input.topic.name} · ${input.openerName}`,
    overwrites,
  });

  if (!created.ok || !created.json || typeof created.json !== "object") {
    const msg =
      typeof created.json === "object" &&
      created.json &&
      "message" in created.json
        ? String((created.json as { message?: string }).message)
        : `채널 생성 실패 (${created.status})`;
    return { ok: false as const, error: msg };
  }

  const channelId = String((created.json as { id?: string }).id || "");
  if (!channelId) return { ok: false as const, error: "채널 ID를 받지 못했어요." };

  const ticket = createTicketRecord({
    guildId: input.guild.guildId,
    channelId,
    topicId: input.topic.id,
    topicName: input.topic.name,
    openerId: input.openerId,
    openerName: input.openerName,
  });
  await persistTicketStore();

  const mentionLine = input.guild.mentionRoleIds.length
    ? input.guild.mentionRoleIds.map((id) => `<@&${id}>`).join(" ")
    : null;

  await postTicketChannelMessage(channelId, {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [
      container([
        ...(mentionLine ? [textDisplay(mentionLine), separator(true, 1)] : []),
        textDisplay(`## ${input.guild.openEmbedTitle}`),
        separator(true, 1),
        textDisplay(input.guild.openEmbedBody),
        textDisplay(`**주제**\n${input.topic.name}`),
        textDisplay(`**요청자**\n<@${input.openerId}>`),
        separator(true, 1),
        actionRow(
          button({
            customId: `tk|${input.guild.guildId}|close|${ticket.id}`,
            label: "티켓 닫기",
            style: ButtonStyle.DANGER,
          }),
        ),
      ]),
    ],
  });

  return { ok: true as const, ticket, channelId };
}

export async function closeTicketFlow(input: {
  ticketId: string;
  closedById: string;
  closedByLabel: string;
  closeReason?: TicketCloseReason | null;
  csat?: 1 | 2 | 3 | 4 | 5 | null;
}) {
  const ticket = getTicketById(input.ticketId);
  if (!ticket || ticket.status !== "open") {
    return { ok: false as const, error: "열린 티켓을 찾을 수 없어요." };
  }
  const guild = getTicketGuild(ticket.guildId);
  if (!guild) return { ok: false as const, error: "서버 설정이 없어요." };

  const messages = await fetchChannelMessages(ticket.channelId, 100);
  const closed = closeTicketRecord(ticket.id, input.closedByLabel, messages, {
    closeReason: input.closeReason ?? null,
    csat: input.csat ?? null,
  });
  if (!closed) return { ok: false as const, error: "티켓을 닫지 못했어요." };
  await persistTicketStore();

  const url = ticketTranscriptUrl(
    closed.transcript.guildId,
    closed.transcript.openerNameSlug,
    closed.transcript.index,
    ticketTranscriptAccessToken(
      closed.transcript.guildId,
      closed.transcript.openerNameSlug,
      closed.transcript.index,
    ),
  );

  const reasonLabel =
    TICKET_CLOSE_REASONS.find((r) => r.id === closed.ticket.closeReason)?.label || "-";

  if (guild.logChannelId) {
    await postTicketChannelMessage(guild.logChannelId, {
      flags: MessageFlags.IS_COMPONENTS_V2,
      components: [
        container([
          textDisplay("## 티켓 종료"),
          separator(true, 1),
          textDisplay(`**주제**\n${closed.ticket.topicName}`),
          textDisplay(`**요청자**\n<@${closed.ticket.openerId}> (${closed.ticket.openerName})`),
          textDisplay(`**닫은 사람**\n${input.closedByLabel}`),
          textDisplay(`**종료 사유**\n${reasonLabel}`),
          textDisplay(
            `**만족도**\n${closed.ticket.csat != null ? `${closed.ticket.csat}/5` : "-"}`,
          ),
          textDisplay(`**트랜스크립트**\n${url}`),
        ]),
      ],
    });
  }

  await deleteTicketChannel(closed.ticket.channelId, "ticket closed");

  return { ok: true as const, ticket: closed.ticket, transcript: closed.transcript, url };
}

export async function replyInTicketChannel(channelId: string, content: string) {
  return postTicketChannelMessage(channelId, { content: content.slice(0, 2000) });
}

export async function fetchOpenTicketMessages(channelId: string) {
  return fetchChannelMessages(channelId, 100);
}

export async function getBotUserId() {
  const res = await ticketBotRest("GET", "/users/@me");
  if (!res.ok || !res.json || typeof res.json !== "object") return null;
  return String((res.json as { id?: string }).id || "") || null;
}

/** Sync Discord ticket-category channels → KV open tickets (repairs lost records).
 *  Only channels under the configured ticket category — never whole-guild name matching
 *  (e.g. random `문의-*` channels must not become tickets).
 *  Log/notice-style channels (관리자로그·충전로그 등) are never treated as tickets.
 */
export async function syncOpenTicketsFromDiscord(guildId: string) {
  const guild = getTicketGuild(guildId);
  if (!guild?.ticketCategoryId) return listTickets(guildId, "open");

  const listed = await listTicketGuildChannels(guildId);
  if (!listed.ok) return listTickets(guildId, "open");

  const candidates = listed.channels.filter(
    (c) =>
      c.type === 0 &&
      c.parentId === guild.ticketCategoryId &&
      !isNonTicketChannelName(c.name) &&
      c.id !== guild.logChannelId,
  );
  const inCatIds = new Set(candidates.map((c) => c.id));
  const channelById = new Map(listed.channels.map((c) => [c.id, c]));

  let changed = false;

  for (const ch of candidates) {
    const before = listTickets(guildId).find((t) => t.channelId === ch.id);
    const upserted = upsertOpenTicketFromChannel({
      guildId,
      channelId: ch.id,
      channelName: ch.name,
    });
    if (!upserted) continue;
    if (!before || before.status !== "open") changed = true;
  }

  for (const ch of candidates) {
    const t = listTickets(guildId).find((x) => x.channelId === ch.id);
    if (t && t.status !== "open") {
      t.status = "open";
      t.closedAt = null;
      t.closedBy = null;
      changed = true;
    }
  }

  // Drop open rows that are outside the ticket category, or are log/notice channels
  const open = listTickets(guildId, "open");
  for (const t of open) {
    const ch = channelById.get(t.channelId);
    if (!ch) {
      // Discord에 채널이 없으면, 로그성으로 잘못 복구된 행만 제거
      if (
        isNonTicketChannelName(t.topicName) ||
        isNonTicketChannelName(t.openerName) ||
        (t.openerId === "unknown" &&
          (t.topicId === "recovered" || /로그|log/i.test(`${t.topicName}${t.openerName}`)))
      ) {
        removeOpenTicketRecord(t.id);
        changed = true;
      }
      continue;
    }
    if (
      !inCatIds.has(ch.id) ||
      isNonTicketChannelName(ch.name) ||
      ch.id === guild.logChannelId
    ) {
      removeOpenTicketRecord(t.id);
      changed = true;
    }
  }

  if (changed) await persistTicketStore();
  return listTickets(guildId, "open");
}
