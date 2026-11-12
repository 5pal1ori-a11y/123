export type ManageBannerStatus = "active" | "expired" | "deleted";

export type ManageGuild = {
  guildId: string;
  guildName: string;
  adminPasswordHash: string;
  adminPasswordPlain: string;
  enabled: boolean;
  /** 상단배너 채널이 생성될 카테고리 */
  bannerCategoryId: string | null;
  /** 채널명 = {prefix}{배너명} */
  bannerChannelPrefix: string;
  bannerPanelTitle: string;
  bannerPanelDescription: string;
  bannerButtonLabel: string;
  /** 자동 파트너 홍보 문구 */
  partnerMessage: string;
  partnerWebhookName: string;
  partnerWebhookAvatarUrl: string | null;
  partnerEnabled: boolean;
  /** KST 시·분 (매일) */
  partnerHourKst: number;
  partnerMinuteKst: number;
  /** YYYY-MM-DD (KST) — 당일 이미 발송했으면 스킵 */
  partnerLastSentDateKst: string | null;
  registeredBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ManageBannerLicense = {
  id: string;
  guildId: string;
  code: string;
  /** 배너 유지 일수 */
  days: number;
  createdAt: string;
  createdBy: string;
  redeemedAt: string | null;
  redeemedBy: string | null;
  bannerId: string | null;
};

export type ManageBanner = {
  id: string;
  guildId: string;
  licenseId: string;
  channelId: string;
  channelName: string;
  displayName: string;
  ownerDiscordId: string;
  ownerUsername: string;
  expiresAt: string;
  status: ManageBannerStatus;
  createdAt: string;
};

export type ManagePartnerWebhook = {
  id: string;
  guildId: string;
  label: string;
  url: string;
  enabled: boolean;
  lastSentAt: string | null;
  lastError: string | null;
  createdAt: string;
};

export type ManagePartnerSendLog = {
  id: string;
  guildId: string;
  webhookId: string;
  webhookLabel: string;
  ok: boolean;
  error: string | null;
  sentAt: string;
};

export type ManageAudit = {
  id: string;
  guildId: string;
  actor: string;
  action: string;
  detail: string;
  createdAt: string;
};

export type ManageEmbedField = {
  name: string;
  value: string;
  inline: boolean;
};

export type ManageEmbedDraft = {
  id: string;
  guildId: string;
  ownerDiscordId: string;
  content: string;
  title: string;
  url: string;
  description: string;
  color: string;
  authorName: string;
  authorUrl: string;
  authorIcon: string;
  footerText: string;
  footerIcon: string;
  thumbnailUrl: string;
  imageUrl: string;
  timestamp: boolean;
  fields: ManageEmbedField[];
  targetChannelId: string | null;
  updatedAt: string;
};

export type ManageDb = {
  guilds: ManageGuild[];
  licenses: ManageBannerLicense[];
  banners: ManageBanner[];
  webhooks: ManagePartnerWebhook[];
  partnerLogs: ManagePartnerSendLog[];
  audits: ManageAudit[];
  embeds: ManageEmbedDraft[];
};

export function emptyManageDb(): ManageDb {
  return {
    guilds: [],
    licenses: [],
    banners: [],
    webhooks: [],
    partnerLogs: [],
    audits: [],
    embeds: [],
  };
}

export function defaultManageGuild(guildId: string, guildName: string): ManageGuild {
  const now = new Date().toISOString();
  return {
    guildId,
    guildName,
    adminPasswordHash: "",
    adminPasswordPlain: "",
    enabled: true,
    bannerCategoryId: null,
    bannerChannelPrefix: "『📢』｜",
    bannerPanelTitle: "상단 배너",
    bannerPanelDescription:
      "라이선스 코드를 준비한 뒤 버튼을 눌러 배너 채널을 생성하세요.",
    bannerButtonLabel: "배너 생성",
    partnerMessage: "파트너 홍보 문구를 입력하세요.",
    partnerWebhookName: "DOES Partner",
    partnerWebhookAvatarUrl: null,
    partnerEnabled: false,
    partnerHourKst: 12,
    partnerMinuteKst: 0,
    partnerLastSentDateKst: null,
    registeredBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

export type ManageGuildPatch = Partial<
  Pick<
    ManageGuild,
    | "guildName"
    | "enabled"
    | "bannerCategoryId"
    | "bannerChannelPrefix"
    | "bannerPanelTitle"
    | "bannerPanelDescription"
    | "bannerButtonLabel"
    | "partnerMessage"
    | "partnerWebhookName"
    | "partnerWebhookAvatarUrl"
    | "partnerEnabled"
    | "partnerHourKst"
    | "partnerMinuteKst"
  >
>;
