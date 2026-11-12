export type TicketTopic = {
  id: string;
  name: string;
  description: string;
  emoji: string | null;
};

export type TicketMacro = {
  id: string;
  label: string;
  body: string;
  /** e.g. "1" → Ctrl+1 */
  shortcut: string | null;
};

export type TicketAudit = {
  id: string;
  guildId: string;
  actor: string;
  action: string;
  detail: string;
  createdAt: string;
};

export type TicketGuild = {
  guildId: string;
  guildName: string;
  adminPasswordHash: string;
  enabled: boolean;
  ticketCategoryId: string | null;
  closeRoleIds: string[];
  /** Roles pinged when a ticket opens */
  mentionRoleIds: string[];
  logChannelId: string | null;
  panelTitle: string;
  panelDescription: string;
  panelColor: number;
  /** Discord panel banner image URL */
  panelBannerUrl: string | null;
  openEmbedTitle: string;
  openEmbedBody: string;
  topics: TicketTopic[];
  /** Discord user IDs blocked from opening tickets */
  blacklistUserIds: string[];
  macros: TicketMacro[];
  /** Optional explicit shop slug; else lookup via shop discordGuildId */
  linkedShopSlug: string | null;
  /** 상점 안내 AI 가 티켓에서 먼저 답한다 (관리자가 답하면 그 티켓은 꺼짐) */
  aiEnabled: boolean;
  registeredBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TicketStatus = "open" | "closed";

export type TicketCloseReason = "resolved" | "spam" | "duplicate" | "other";

export type TicketRecord = {
  id: string;
  guildId: string;
  channelId: string;
  topicId: string;
  topicName: string;
  openerId: string;
  openerName: string;
  openerNameSlug: string;
  status: TicketStatus;
  userTicketIndex: number;
  createdAt: string;
  closedAt: string | null;
  closedBy: string | null;
  closeReason: TicketCloseReason | null;
  csat: 1 | 2 | 3 | 4 | 5 | null;
  firstStaffReplyAt: string | null;
  /** 관리자가 티켓에서 말하면 그 뒤로 AI 가 답하지 않는다 */
  aiPaused: boolean;
  aiGreetedAt: string | null;
};

export type TranscriptAttachment = {
  id: string;
  filename: string;
  url: string;
  contentType: string | null;
  size: number;
};

export type TranscriptMessage = {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  content: string;
  attachments: TranscriptAttachment[];
  createdAt: string;
  bot: boolean;
};

export type TicketTranscript = {
  id: string;
  guildId: string;
  ticketId: string;
  openerNameSlug: string;
  index: number;
  topicName: string;
  openerId: string;
  openerName: string;
  closedBy: string | null;
  createdAt: string;
  closedAt: string;
  closeReason: TicketCloseReason | null;
  csat: 1 | 2 | 3 | 4 | 5 | null;
  messages: TranscriptMessage[];
};

export type TicketDb = {
  guilds: TicketGuild[];
  tickets: TicketRecord[];
  transcripts: TicketTranscript[];
  audits: TicketAudit[];
};

export function emptyTicketDb(): TicketDb {
  return { guilds: [], tickets: [], transcripts: [], audits: [] };
}

export function defaultTicketTopics(): TicketTopic[] {
  return [
    {
      id: "support",
      name: "문의",
      description: "일반 문의",
      emoji: null,
    },
    {
      id: "report",
      name: "신고",
      description: "신고 / 제보",
      emoji: null,
    },
  ];
}

export function defaultTicketGuildPanel() {
  return {
    panelTitle: "티켓 생성",
    panelDescription: "아래에서 주제를 선택하면 전용 채널이 생성됩니다.",
    panelColor: 0x5865f2,
    openEmbedTitle: "티켓이 생성되었습니다",
    openEmbedBody: "스태프가 곧 응답합니다. 내용을 자세히 적어 주세요.",
  };
}

export const TICKET_CLOSE_REASONS: { id: TicketCloseReason; label: string }[] = [
  { id: "resolved", label: "해결됨" },
  { id: "spam", label: "스팸" },
  { id: "duplicate", label: "중복" },
  { id: "other", label: "기타" },
];

export type TicketGuildPatch = Partial<
  Pick<
    TicketGuild,
    | "enabled"
    | "guildName"
    | "ticketCategoryId"
    | "closeRoleIds"
    | "mentionRoleIds"
    | "logChannelId"
    | "panelTitle"
    | "panelDescription"
    | "panelColor"
    | "panelBannerUrl"
    | "openEmbedTitle"
    | "openEmbedBody"
    | "topics"
    | "blacklistUserIds"
    | "macros"
    | "linkedShopSlug"
    | "aiEnabled"
  >
>;

export function slugifyUsername(name: string) {
  const raw = (name || "user")
    .normalize("NFKD")
    .replace(/[^\w가-힣-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 40);
  return raw || "user";
}

export function sanitizeChannelName(topic: string, username: string) {
  const base = `${topic}-${username}`
    .toLowerCase()
    .replace(/[^\w가-힣-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
  return base || "ticket";
}

/** Expand macro body with ticket context */
export function expandTicketMacro(
  body: string,
  ctx: {
    openerName: string;
    openerId: string;
    topicName: string;
    channelId: string;
    userTicketIndex: number;
  },
) {
  return body
    .replaceAll("{user}", ctx.openerName)
    .replaceAll("{user_id}", ctx.openerId)
    .replaceAll("{mention}", `<@${ctx.openerId}>`)
    .replaceAll("{ticket}", `${ctx.topicName}-${ctx.openerName} #${ctx.userTicketIndex}`)
    .replaceAll("{channel}", `<#${ctx.channelId}>`)
    .replaceAll("{topic}", ctx.topicName);
}
