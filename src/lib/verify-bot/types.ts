import type { VerifyPlanTier } from "@/lib/verify-bot/plan";

export type VerifyGuild = {
  guildId: string;
  guildName: string;
  adminPasswordHash: string;
  recoveryKeyHash: string | null;
  planTier: VerifyPlanTier;
  enabled: boolean;
  verifiedRoleId: string | null;
  logChannelId: string | null;
  logIp: boolean;
  logEmail: boolean;
  requireEmail: boolean;
  /** Discord email-verified (phone not exposed by API; best-effort) */
  requirePhoneLinked: boolean;
  blockVpn: boolean;
  blockProxy: boolean;
  blockMobile: boolean;
  blockForeign: boolean;
  allowedCountries: string[];
  panelTitle: string;
  panelDescription: string;
  buttonLabel: string;
  minAccountAgeDays: number;
  maxVerifiesPerIpPerDay: number;
  reverifyCooldownHours: number;
  /** Kick members without verified role after N minutes (0 = off) */
  kickUnverifiedMinutes: number;
  enableTurnstile: boolean;
  trackSources: boolean;
  blacklistUserIds: string[];
  blacklistIps: string[];
  whitelistIps: string[];
  webhookUrl: string | null;
  dmOnVerify: boolean;
  dmMessage: string;
  logBlockedAttempts: boolean;
  blockDuplicateIp: boolean;
  lastMemberCount: number;
  joinsToday: number;
  verifiesToday: number;
  blockedToday: number;
  countersDate: string;
  verifyTotal: number;
  blockedTotal: number;
  registeredBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VerifyEventStatus = "ok" | "blocked";

export type VerifyEvent = {
  id: string;
  guildId: string;
  /** Display name of the Discord server at verify time */
  guildName: string | null;
  discordUserId: string;
  username: string;
  email: string | null;
  ip: string | null;
  userAgent: string | null;
  /** Short device label e.g. "Android · Chrome (모바일)" */
  device: string | null;
  country: string | null;
  /** Estimated region e.g. "Seoul · KR" */
  region: string | null;
  /** ISP / carrier */
  isp: string | null;
  flags: string[];
  status: VerifyEventStatus;
  reason: string | null;
  createdAt: string;
};

export type VerifyMember = {
  guildId: string;
  discordUserId: string;
  username: string;
  refreshTokenEnc: string | null;
  verifyCount: number;
  lastIp: string | null;
  lastCountry: string | null;
  updatedAt: string;
  createdAt: string;
};

export type VerifyAuditAction =
  | "login_ok"
  | "login_fail"
  | "settings_save"
  | "password_change"
  | "recovery_rotate"
  | "recovery_use"
  | "member_remove"
  | "logs_clear"
  | "logs_export"
  | "members_export"
  | "slash_ban"
  | "slash_unban"
  | "auto_kick"
  | "plan_note";

export type VerifyAudit = {
  id: string;
  guildId: string;
  action: VerifyAuditAction;
  actor: string;
  ip: string | null;
  detail: string | null;
  createdAt: string;
};

export type VerifyPendingJoin = {
  guildId: string;
  discordUserId: string;
  username: string;
  joinedAt: string;
};

export type VerifyDb = {
  guilds: VerifyGuild[];
  events: VerifyEvent[];
  members: VerifyMember[];
  audits: VerifyAudit[];
  pendingJoins: VerifyPendingJoin[];
};

export function emptyVerifyDb(): VerifyDb {
  return { guilds: [], events: [], members: [], audits: [], pendingJoins: [] };
}

export function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function defaultVerifyGuildLimits() {
  return {
    blockVpn: false,
    blockProxy: false,
    blockMobile: false,
    blockForeign: false,
    allowedCountries: ["KR"] as string[],
  };
}

export function defaultVerifyGuildPanel() {
  return {
    panelTitle: "서버 인증",
    panelDescription:
      "아래 버튼을 눌러 Discord 계정으로 인증하면 역할이 부여됩니다.",
    buttonLabel: "인증하기",
    minAccountAgeDays: 0,
    maxVerifiesPerIpPerDay: 0,
    reverifyCooldownHours: 0,
    kickUnverifiedMinutes: 0,
    enableTurnstile: false,
    trackSources: true,
    requirePhoneLinked: false,
    blacklistUserIds: [] as string[],
    blacklistIps: [] as string[],
    whitelistIps: [] as string[],
    webhookUrl: null as string | null,
    dmOnVerify: false,
    dmMessage: "인증이 완료되었습니다. 서버를 이용해주세요!",
    logBlockedAttempts: true,
    blockDuplicateIp: false,
    planTier: "pro" as VerifyPlanTier,
  };
}

export type VerifyGuildPatch = Partial<
  Pick<
    VerifyGuild,
    | "enabled"
    | "verifiedRoleId"
    | "logChannelId"
    | "logIp"
    | "logEmail"
    | "requireEmail"
    | "requirePhoneLinked"
    | "guildName"
    | "joinsToday"
    | "blockVpn"
    | "blockProxy"
    | "blockMobile"
    | "blockForeign"
    | "allowedCountries"
    | "panelTitle"
    | "panelDescription"
    | "buttonLabel"
    | "minAccountAgeDays"
    | "maxVerifiesPerIpPerDay"
    | "reverifyCooldownHours"
    | "kickUnverifiedMinutes"
    | "enableTurnstile"
    | "trackSources"
    | "blacklistUserIds"
    | "blacklistIps"
    | "whitelistIps"
    | "webhookUrl"
    | "dmOnVerify"
    | "dmMessage"
    | "logBlockedAttempts"
    | "blockDuplicateIp"
    | "planTier"
  >
>;
