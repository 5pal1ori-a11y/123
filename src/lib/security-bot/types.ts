export type SecurityGuild = {
  guildId: string;
  guildName: string;
  adminPasswordHash: string;
  /** Recoverable panel password for /보안웹 (never exposed via HTTP API) */
  adminPasswordPlain: string;
  enabled: boolean;
  logChannelId: string | null;
  modRoleIds: string[];
  protectedRoleIds: string[];
  protectedUserIds: string[];

  antiRaidEnabled: boolean;
  raidJoinThreshold: number;
  raidWindowSeconds: number;
  raidAction: "lockdown" | "kick" | "ban" | "quarantine";
  raidAlertOnly: boolean;
  raidSlowmodeSeconds: number;

  blockEveryoneHere: boolean;
  mentionSpamLimit: number;
  mentionSpamAction: "delete" | "timeout" | "kick";

  antiNukeEnabled: boolean;
  nukeThreshold: number;
  nukeWindowSeconds: number;
  stripDangerousOnNuke: boolean;

  protectAdminRoles: boolean;
  trustedAdminRoleIds: string[];
  /** Strip Administrator / Manage Roles from non-trusted roles on grant */
  stripDangerousPerms: boolean;

  antiInviteSpam: boolean;
  antiLinkSpam: boolean;
  antiScamKeywords: boolean;
  antiMessageFlood: boolean;
  messageFloodLimit: number;
  messageFloodWindowSeconds: number;
  messageFloodAction: "timeout" | "kick" | "delete";

  minAccountAgeHours: number;
  blockDefaultAvatars: boolean;
  quarantineRoleId: string | null;
  alertRoleId: string | null;

  /** Warn auto-punish: 0 = off */
  warnThreshold: number;
  warnAction: "mute" | "kick" | "ban";
  warnMuteMinutes: number;

  /** Exempt from spam / everyone / flood checks */
  whitelistRoleIds: string[];
  whitelistChannelIds: string[];

  weeklyReportEnabled: boolean;
  lastWeeklyReportAt: string | null;
  autoSnapshotEnabled: boolean;
  lastSnapshotAt: string | null;

  lockdownActive: boolean;

  registeredBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SecurityEvent = {
  id: string;
  guildId: string;
  type: string;
  actorId: string | null;
  actorName: string | null;
  targetId: string | null;
  targetName: string | null;
  detail: string;
  createdAt: string;
};

export type SecurityAudit = {
  id: string;
  guildId: string;
  actor: string;
  action: string;
  detail: string;
  createdAt: string;
};

export type SecurityTempBan = {
  id: string;
  guildId: string;
  userId: string;
  reason: string;
  expiresAt: string;
  createdBy: string;
  createdAt: string;
};

export type SecuritySnapshot = {
  id: string;
  guildId: string;
  label: string;
  createdAt: string;
  createdBy: string;
  channels: { id: string; name: string; type: number; parentId: string | null }[];
  roles: { id: string; name: string; permissions: string; position: number }[];
};

export type SecurityDb = {
  guilds: SecurityGuild[];
  events: SecurityEvent[];
  audits: SecurityAudit[];
  recentJoins: { guildId: string; userId: string; at: string }[];
  recentNukeActions: { guildId: string; actorId: string; kind: string; at: string }[];
  tempBans: SecurityTempBan[];
  snapshots: SecuritySnapshot[];
};

export function emptySecurityDb(): SecurityDb {
  return {
    guilds: [],
    events: [],
    audits: [],
    recentJoins: [],
    recentNukeActions: [],
    tempBans: [],
    snapshots: [],
  };
}

export function defaultSecurityGuild(guildId: string, guildName: string): Omit<
  SecurityGuild,
  "adminPasswordHash" | "adminPasswordPlain" | "registeredBy" | "createdAt" | "updatedAt"
> {
  return {
    guildId,
    guildName,
    enabled: true,
    logChannelId: null,
    modRoleIds: [],
    protectedRoleIds: [],
    protectedUserIds: [],
    antiRaidEnabled: true,
    raidJoinThreshold: 8,
    raidWindowSeconds: 20,
    raidAction: "lockdown",
    raidAlertOnly: false,
    raidSlowmodeSeconds: 10,
    blockEveryoneHere: true,
    mentionSpamLimit: 5,
    mentionSpamAction: "timeout",
    antiNukeEnabled: true,
    nukeThreshold: 3,
    nukeWindowSeconds: 30,
    stripDangerousOnNuke: true,
    protectAdminRoles: true,
    trustedAdminRoleIds: [],
    stripDangerousPerms: true,
    antiInviteSpam: true,
    antiLinkSpam: true,
    antiScamKeywords: true,
    antiMessageFlood: true,
    messageFloodLimit: 8,
    messageFloodWindowSeconds: 5,
    messageFloodAction: "timeout",
    minAccountAgeHours: 24,
    blockDefaultAvatars: false,
    quarantineRoleId: null,
    alertRoleId: null,
    warnThreshold: 3,
    warnAction: "mute",
    warnMuteMinutes: 60,
    whitelistRoleIds: [],
    whitelistChannelIds: [],
    weeklyReportEnabled: true,
    lastWeeklyReportAt: null,
    autoSnapshotEnabled: true,
    lastSnapshotAt: null,
    lockdownActive: false,
  };
}

export type SecurityGuildPatch = Partial<
  Pick<
    SecurityGuild,
    | "enabled"
    | "guildName"
    | "logChannelId"
    | "modRoleIds"
    | "protectedRoleIds"
    | "protectedUserIds"
    | "antiRaidEnabled"
    | "raidJoinThreshold"
    | "raidWindowSeconds"
    | "raidAction"
    | "raidAlertOnly"
    | "raidSlowmodeSeconds"
    | "blockEveryoneHere"
    | "mentionSpamLimit"
    | "mentionSpamAction"
    | "antiNukeEnabled"
    | "nukeThreshold"
    | "nukeWindowSeconds"
    | "stripDangerousOnNuke"
    | "protectAdminRoles"
    | "trustedAdminRoleIds"
    | "stripDangerousPerms"
    | "antiInviteSpam"
    | "antiLinkSpam"
    | "antiScamKeywords"
    | "antiMessageFlood"
    | "messageFloodLimit"
    | "messageFloodWindowSeconds"
    | "messageFloodAction"
    | "minAccountAgeHours"
    | "blockDefaultAvatars"
    | "quarantineRoleId"
    | "alertRoleId"
    | "warnThreshold"
    | "warnAction"
    | "warnMuteMinutes"
    | "whitelistRoleIds"
    | "whitelistChannelIds"
    | "weeklyReportEnabled"
    | "autoSnapshotEnabled"
    | "lockdownActive"
  >
>;
