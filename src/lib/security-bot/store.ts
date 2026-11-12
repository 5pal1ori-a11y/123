import { randomBytes, randomUUID } from "crypto";
import { getKvBinding } from "@/lib/db-persist";
import { hashPassword, verifyPassword } from "@/lib/auth";
import {
  defaultSecurityGuild,
  emptySecurityDb,
  type SecurityAudit,
  type SecurityDb,
  type SecurityEvent,
  type SecurityGuild,
  type SecurityGuildPatch,
  type SecuritySnapshot,
  type SecurityTempBan,
} from "@/lib/security-bot/types";

export const SECURITY_DB_KV_KEY = "vendix:security-db";

const globalForSec = globalThis as unknown as {
  __vendixSecurityDb?: SecurityDb;
  __vendixSecurityLoadedAt?: number;
};

const CACHE_TTL_MS = 5_000;

function markFresh() {
  globalForSec.__vendixSecurityLoadedAt = Date.now();
}

function cacheValid() {
  const at = globalForSec.__vendixSecurityLoadedAt ?? 0;
  return Boolean(globalForSec.__vendixSecurityDb) && Date.now() - at < CACHE_TTL_MS;
}

function getDb(): SecurityDb {
  if (!globalForSec.__vendixSecurityDb) {
    globalForSec.__vendixSecurityDb = emptySecurityDb();
  }
  return globalForSec.__vendixSecurityDb;
}

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

function normalizeGuild(raw: Partial<SecurityGuild> & { guildId: string }): SecurityGuild {
  const d = defaultSecurityGuild(raw.guildId, raw.guildName || `서버-${raw.guildId.slice(-4)}`);
  return {
    ...d,
    ...raw,
    guildId: raw.guildId,
    guildName: raw.guildName || d.guildName,
    adminPasswordHash: raw.adminPasswordHash || "",
    adminPasswordPlain: typeof raw.adminPasswordPlain === "string" ? raw.adminPasswordPlain : "",
    enabled: raw.enabled !== false,
    logChannelId: raw.logChannelId ?? null,
    modRoleIds: asStringList(raw.modRoleIds),
    protectedRoleIds: asStringList(raw.protectedRoleIds),
    protectedUserIds: asStringList(raw.protectedUserIds),
    antiRaidEnabled: raw.antiRaidEnabled !== false,
    raidJoinThreshold: Math.max(3, Number(raw.raidJoinThreshold) || d.raidJoinThreshold),
    raidWindowSeconds: Math.max(5, Number(raw.raidWindowSeconds) || d.raidWindowSeconds),
    raidAction:
      raw.raidAction === "kick" ||
      raw.raidAction === "ban" ||
      raw.raidAction === "lockdown" ||
      raw.raidAction === "quarantine"
        ? raw.raidAction
        : d.raidAction,
    raidAlertOnly: Boolean(raw.raidAlertOnly),
    raidSlowmodeSeconds: Math.max(0, Number(raw.raidSlowmodeSeconds) || 0),
    blockEveryoneHere: raw.blockEveryoneHere !== false,
    mentionSpamLimit: Math.max(2, Number(raw.mentionSpamLimit) || d.mentionSpamLimit),
    mentionSpamAction:
      raw.mentionSpamAction === "delete" ||
      raw.mentionSpamAction === "timeout" ||
      raw.mentionSpamAction === "kick"
        ? raw.mentionSpamAction
        : d.mentionSpamAction,
    antiNukeEnabled: raw.antiNukeEnabled !== false,
    nukeThreshold: Math.max(2, Number(raw.nukeThreshold) || d.nukeThreshold),
    nukeWindowSeconds: Math.max(5, Number(raw.nukeWindowSeconds) || d.nukeWindowSeconds),
    stripDangerousOnNuke: raw.stripDangerousOnNuke !== false,
    protectAdminRoles: raw.protectAdminRoles !== false,
    trustedAdminRoleIds: asStringList(raw.trustedAdminRoleIds),
    antiInviteSpam: raw.antiInviteSpam !== false,
    antiLinkSpam: raw.antiLinkSpam !== false,
    antiScamKeywords: raw.antiScamKeywords !== false,
    antiMessageFlood: raw.antiMessageFlood !== false,
    messageFloodLimit: Math.max(3, Number(raw.messageFloodLimit) || d.messageFloodLimit),
    messageFloodWindowSeconds: Math.max(
      2,
      Number(raw.messageFloodWindowSeconds) || d.messageFloodWindowSeconds,
    ),
    messageFloodAction:
      raw.messageFloodAction === "kick" ||
      raw.messageFloodAction === "delete" ||
      raw.messageFloodAction === "timeout"
        ? raw.messageFloodAction
        : d.messageFloodAction,
    minAccountAgeHours: Math.max(0, Number(raw.minAccountAgeHours) || 0),
    blockDefaultAvatars: Boolean(raw.blockDefaultAvatars),
    quarantineRoleId: raw.quarantineRoleId?.trim() || null,
    alertRoleId: raw.alertRoleId?.trim() || null,
    stripDangerousPerms: raw.stripDangerousPerms !== false,
    warnThreshold: Number.isFinite(Number(raw.warnThreshold))
      ? Math.max(0, Number(raw.warnThreshold))
      : d.warnThreshold,
    warnAction:
      raw.warnAction === "kick" || raw.warnAction === "ban" || raw.warnAction === "mute"
        ? raw.warnAction
        : d.warnAction,
    warnMuteMinutes: Math.max(1, Number(raw.warnMuteMinutes) || d.warnMuteMinutes),
    whitelistRoleIds: asStringList(raw.whitelistRoleIds),
    whitelistChannelIds: asStringList(raw.whitelistChannelIds),
    weeklyReportEnabled: raw.weeklyReportEnabled !== false,
    lastWeeklyReportAt: raw.lastWeeklyReportAt ?? null,
    autoSnapshotEnabled: raw.autoSnapshotEnabled !== false,
    lastSnapshotAt: raw.lastSnapshotAt ?? null,
    lockdownActive: Boolean(raw.lockdownActive),
    registeredBy: raw.registeredBy ?? null,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

function normalizeEvent(raw: Partial<SecurityEvent> & { id: string; guildId: string }): SecurityEvent {
  return {
    id: raw.id,
    guildId: raw.guildId,
    type: raw.type || "log",
    actorId: raw.actorId ?? null,
    actorName: raw.actorName ?? null,
    targetId: raw.targetId ?? null,
    targetName: raw.targetName ?? null,
    detail: (raw.detail || "").slice(0, 500),
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

function normalizeAudit(raw: Partial<SecurityAudit> & { id: string; guildId: string }): SecurityAudit {
  return {
    id: raw.id,
    guildId: raw.guildId,
    actor: raw.actor || "system",
    action: raw.action || "unknown",
    detail: (raw.detail || "").slice(0, 500),
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

function normalizeDb(raw: Partial<SecurityDb> | null): SecurityDb {
  return {
    guilds: Array.isArray(raw?.guilds)
      ? raw!.guilds!.filter((g) => g?.guildId).map((g) => normalizeGuild(g))
      : [],
    events: Array.isArray(raw?.events)
      ? raw!.events!.filter((e) => e?.id && e?.guildId).map((e) => normalizeEvent(e as SecurityEvent))
      : [],
    audits: Array.isArray(raw?.audits)
      ? raw!.audits!.filter((a) => a?.id && a?.guildId).map((a) => normalizeAudit(a as SecurityAudit))
      : [],
    recentJoins: Array.isArray(raw?.recentJoins)
      ? raw!.recentJoins!.filter((j) => j?.guildId && j?.userId && j?.at).slice(0, 2000)
      : [],
    recentNukeActions: Array.isArray(raw?.recentNukeActions)
      ? raw!
          .recentNukeActions!.filter((j) => j?.guildId && j?.actorId && j?.at)
          .slice(0, 2000)
      : [],
    tempBans: Array.isArray(raw?.tempBans)
      ? raw!
          .tempBans!.filter((b) => b?.id && b?.guildId && b?.userId && b?.expiresAt)
          .map((b) => ({
            id: b.id,
            guildId: b.guildId,
            userId: b.userId,
            reason: (b.reason || "").slice(0, 300),
            expiresAt: b.expiresAt,
            createdBy: b.createdBy || "system",
            createdAt: b.createdAt || new Date().toISOString(),
          }))
          .slice(0, 500)
      : [],
    snapshots: Array.isArray(raw?.snapshots)
      ? raw!
          .snapshots!.filter((s) => s?.id && s?.guildId)
          .map((s) => ({
            id: s.id,
            guildId: s.guildId,
            label: (s.label || "snapshot").slice(0, 80),
            createdAt: s.createdAt || new Date().toISOString(),
            createdBy: s.createdBy || "system",
            channels: Array.isArray(s.channels) ? s.channels.slice(0, 500) : [],
            roles: Array.isArray(s.roles) ? s.roles.slice(0, 300) : [],
          }))
          .slice(0, 80)
      : [],
  };
}

export async function initSecurityStore(opts?: { force?: boolean }) {
  if (!opts?.force && cacheValid()) return getDb();
  const kv = await getKvBinding();
  if (kv) {
    try {
      const raw = await kv.get(SECURITY_DB_KV_KEY);
      if (raw) {
        globalForSec.__vendixSecurityDb = normalizeDb(JSON.parse(raw) as Partial<SecurityDb>);
      } else if (!globalForSec.__vendixSecurityDb) {
        globalForSec.__vendixSecurityDb = emptySecurityDb();
      }
    } catch {
      if (!globalForSec.__vendixSecurityDb) {
        globalForSec.__vendixSecurityDb = emptySecurityDb();
      }
    }
  } else if (!globalForSec.__vendixSecurityDb) {
    globalForSec.__vendixSecurityDb = emptySecurityDb();
  }
  markFresh();
  return getDb();
}

export async function persistSecurityStore() {
  const local = getDb();
  try {
    const kv = await getKvBinding();
    if (kv) {
      let remote = emptySecurityDb();
      try {
        const raw = await kv.get(SECURITY_DB_KV_KEY);
        if (raw) remote = normalizeDb(JSON.parse(raw) as Partial<SecurityDb>);
      } catch {
        /* empty */
      }
      const guildMap = new Map<string, SecurityGuild>();
      for (const g of remote.guilds) guildMap.set(g.guildId, g);
      for (const g of local.guilds) guildMap.set(g.guildId, g);

      const eventMap = new Map<string, SecurityEvent>();
      for (const e of remote.events) eventMap.set(e.id, e);
      for (const e of local.events) eventMap.set(e.id, e);

      const auditMap = new Map<string, SecurityAudit>();
      for (const a of remote.audits) auditMap.set(a.id, a);
      for (const a of local.audits) auditMap.set(a.id, a);

      const joins = [...(remote.recentJoins || []), ...(local.recentJoins || [])]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 1500);

      const nukes = [...(remote.recentNukeActions || []), ...(local.recentNukeActions || [])]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 1500);

      const banMap = new Map<string, SecurityTempBan>();
      for (const b of remote.tempBans || []) banMap.set(b.id, b);
      for (const b of local.tempBans || []) banMap.set(b.id, b);

      const snapMap = new Map<string, SecuritySnapshot>();
      for (const s of remote.snapshots || []) snapMap.set(s.id, s);
      for (const s of local.snapshots || []) snapMap.set(s.id, s);

      const merged: SecurityDb = {
        guilds: [...guildMap.values()],
        events: [...eventMap.values()]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 800),
        audits: [...auditMap.values()]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 400),
        recentJoins: joins,
        recentNukeActions: nukes,
        tempBans: [...banMap.values()]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 500),
        snapshots: [...snapMap.values()]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 80),
      };
      globalForSec.__vendixSecurityDb = merged;
      await kv.put(SECURITY_DB_KV_KEY, JSON.stringify(merged));
    }
  } catch (err) {
    console.error("[security-bot] persist failed", err);
  }
  markFresh();
}

export async function refreshSecurityStore() {
  return initSecurityStore({ force: true });
}

export function getSecurityGuild(guildId: string) {
  return getDb().guilds.find((g) => g.guildId === guildId) ?? null;
}

export function registerSecurityGuild(input: {
  guildId: string;
  guildName: string;
  registeredBy: string;
}) {
  const db = getDb();
  const password = randomBytes(6).toString("hex");
  const now = new Date().toISOString();
  const existing = db.guilds.find((g) => g.guildId === input.guildId);
  if (existing) {
    existing.adminPasswordHash = hashPassword(password);
    existing.adminPasswordPlain = password;
    existing.guildName = input.guildName || existing.guildName;
    existing.registeredBy = input.registeredBy;
    existing.updatedAt = now;
    existing.enabled = true;
    return { guild: existing, password, created: false };
  }
  const base = defaultSecurityGuild(input.guildId, input.guildName);
  const guild = normalizeGuild({
    ...base,
    adminPasswordHash: hashPassword(password),
    adminPasswordPlain: password,
    registeredBy: input.registeredBy,
    createdAt: now,
    updatedAt: now,
  });
  db.guilds.push(guild);
  return { guild, password, created: true };
}

/** Reveal stored panel password, or rotate if missing (legacy guilds). */
export function revealSecurityGuildPassword(guildId: string): {
  guild: SecurityGuild;
  password: string;
  rotated: boolean;
} | null {
  const guild = getSecurityGuild(guildId);
  if (!guild) return null;
  if (guild.adminPasswordPlain?.trim()) {
    return { guild, password: guild.adminPasswordPlain.trim(), rotated: false };
  }
  const password = randomBytes(6).toString("hex");
  guild.adminPasswordHash = hashPassword(password);
  guild.adminPasswordPlain = password;
  guild.updatedAt = new Date().toISOString();
  return { guild, password, rotated: true };
}

export function verifySecurityGuildLogin(guildId: string, password: string) {
  const guild = getSecurityGuild(guildId);
  if (!guild?.adminPasswordHash) return false;
  return verifyPassword(password, guild.adminPasswordHash);
}

export function setSecurityGuildPassword(guildId: string, newPassword: string) {
  const guild = getSecurityGuild(guildId);
  if (!guild) return false;
  guild.adminPasswordHash = hashPassword(newPassword);
  guild.adminPasswordPlain = newPassword;
  guild.updatedAt = new Date().toISOString();
  return true;
}

export function updateSecurityGuild(guildId: string, patch: SecurityGuildPatch) {
  const guild = getSecurityGuild(guildId);
  if (!guild) return null;
  const keys = Object.keys(patch) as (keyof SecurityGuildPatch)[];
  for (const k of keys) {
    const v = patch[k];
    if (v === undefined) continue;
    (guild as Record<string, unknown>)[k as string] = v;
  }
  if (patch.modRoleIds) guild.modRoleIds = asStringList(patch.modRoleIds);
  if (patch.protectedRoleIds) guild.protectedRoleIds = asStringList(patch.protectedRoleIds);
  if (patch.protectedUserIds) guild.protectedUserIds = asStringList(patch.protectedUserIds);
  if (patch.trustedAdminRoleIds) guild.trustedAdminRoleIds = asStringList(patch.trustedAdminRoleIds);
  if (patch.whitelistRoleIds) guild.whitelistRoleIds = asStringList(patch.whitelistRoleIds);
  if (patch.whitelistChannelIds) guild.whitelistChannelIds = asStringList(patch.whitelistChannelIds);
  if (patch.logChannelId !== undefined) {
    guild.logChannelId = patch.logChannelId?.trim() || null;
  }
  if (patch.quarantineRoleId !== undefined) {
    guild.quarantineRoleId = patch.quarantineRoleId?.trim() || null;
  }
  if (patch.alertRoleId !== undefined) {
    guild.alertRoleId = patch.alertRoleId?.trim() || null;
  }
  guild.updatedAt = new Date().toISOString();
  return guild;
}

export function publicSecurityGuild(guild: SecurityGuild) {
  const { adminPasswordHash: _, adminPasswordPlain: __, registeredBy: ___, ...safe } = guild;
  void _;
  void __;
  void ___;
  return safe;
}

export function appendSecurityEvent(input: Omit<SecurityEvent, "id" | "createdAt">) {
  const db = getDb();
  db.events.unshift({
    ...input,
    id: randomUUID(),
    detail: input.detail.slice(0, 500),
    createdAt: new Date().toISOString(),
  });
  if (db.events.length > 800) db.events.length = 800;
}

export function listSecurityEvents(guildId: string, limit = 80) {
  return getDb()
    .events.filter((e) => e.guildId === guildId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function appendSecurityAudit(input: {
  guildId: string;
  actor: string;
  action: string;
  detail: string;
}) {
  const db = getDb();
  db.audits.unshift({
    id: randomUUID(),
    guildId: input.guildId,
    actor: input.actor,
    action: input.action,
    detail: input.detail.slice(0, 500),
    createdAt: new Date().toISOString(),
  });
  if (db.audits.length > 400) db.audits.length = 400;
}

export function listSecurityAudits(guildId: string, limit = 80) {
  return getDb()
    .audits.filter((a) => a.guildId === guildId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function recordJoin(guildId: string, userId: string) {
  const db = getDb();
  const now = new Date().toISOString();
  db.recentJoins.unshift({ guildId, userId, at: now });
  if (db.recentJoins.length > 1500) db.recentJoins.length = 1500;
  return now;
}

export function countRecentJoins(guildId: string, windowSeconds: number) {
  const since = Date.now() - windowSeconds * 1000;
  return getDb().recentJoins.filter(
    (j) => j.guildId === guildId && new Date(j.at).getTime() >= since,
  ).length;
}

export function recordNukeAction(guildId: string, actorId: string, kind: string) {
  const db = getDb();
  db.recentNukeActions.unshift({
    guildId,
    actorId,
    kind,
    at: new Date().toISOString(),
  });
  if (db.recentNukeActions.length > 1500) db.recentNukeActions.length = 1500;
}

export function countRecentNukeActions(
  guildId: string,
  actorId: string,
  windowSeconds: number,
) {
  const since = Date.now() - windowSeconds * 1000;
  return getDb().recentNukeActions.filter(
    (j) =>
      j.guildId === guildId &&
      new Date(j.at).getTime() >= since &&
      (actorId === "*" || actorId === "unknown" || j.actorId === actorId),
  ).length;
}

export function isProtectedTarget(guild: SecurityGuild, userId: string, roleIds: string[]) {
  if (guild.protectedUserIds.includes(userId)) return true;
  return roleIds.some((r) => guild.protectedRoleIds.includes(r));
}

export function canUseModCommands(guild: SecurityGuild, roleIds: string[], permissions?: string) {
  try {
    if (permissions) {
      const p = BigInt(permissions);
      const ADMIN = BigInt(1) << BigInt(3);
      const MANAGE = BigInt(1) << BigInt(5);
      if ((p & ADMIN) === ADMIN || (p & MANAGE) === MANAGE) return true;
    }
  } catch {
    /* ignore */
  }
  if (!guild.modRoleIds.length) return false;
  return roleIds.some((r) => guild.modRoleIds.includes(r));
}

export function isSpamExempt(
  guild: SecurityGuild,
  opts: { userId?: string; roleIds?: string[]; channelId?: string },
) {
  if (opts.userId && guild.protectedUserIds.includes(opts.userId)) return true;
  if (opts.channelId && guild.whitelistChannelIds.includes(opts.channelId)) return true;
  if (opts.roleIds?.some((r) => guild.whitelistRoleIds.includes(r))) return true;
  if (opts.roleIds?.some((r) => guild.modRoleIds.includes(r))) return true;
  return false;
}

export function countWarns(guildId: string, userId: string) {
  return getDb().events.filter(
    (e) => e.guildId === guildId && e.type === "warn" && e.targetId === userId,
  ).length;
}

export function addTempBan(input: Omit<SecurityTempBan, "id" | "createdAt">) {
  const db = getDb();
  // replace existing pending ban for same user
  db.tempBans = db.tempBans.filter(
    (b) => !(b.guildId === input.guildId && b.userId === input.userId),
  );
  const row: SecurityTempBan = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  db.tempBans.unshift(row);
  if (db.tempBans.length > 500) db.tempBans.length = 500;
  return row;
}

export function listExpiredTempBans(now = Date.now()) {
  return getDb().tempBans.filter((b) => new Date(b.expiresAt).getTime() <= now);
}

export function removeTempBan(id: string) {
  const db = getDb();
  db.tempBans = db.tempBans.filter((b) => b.id !== id);
}

export function listTempBans(guildId: string) {
  return getDb()
    .tempBans.filter((b) => b.guildId === guildId)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}

export function addSnapshot(input: Omit<SecuritySnapshot, "id" | "createdAt">) {
  const db = getDb();
  const row: SecuritySnapshot = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  db.snapshots.unshift(row);
  // keep last 10 per guild
  const byGuild = db.snapshots.filter((s) => s.guildId === input.guildId);
  if (byGuild.length > 10) {
    const drop = new Set(byGuild.slice(10).map((s) => s.id));
    db.snapshots = db.snapshots.filter((s) => !drop.has(s.id));
  }
  return row;
}

export function listSnapshots(guildId: string, limit = 10) {
  return getDb()
    .snapshots.filter((s) => s.guildId === guildId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function getSnapshot(guildId: string, snapshotId: string) {
  return getDb().snapshots.find((s) => s.guildId === guildId && s.id === snapshotId) ?? null;
}

export function eventCountsSince(guildId: string, sinceMs: number) {
  const since = new Date(sinceMs).toISOString();
  const rows = getDb().events.filter((e) => e.guildId === guildId && e.createdAt >= since);
  const counts: Record<string, number> = {};
  for (const e of rows) {
    counts[e.type] = (counts[e.type] || 0) + 1;
  }
  return { total: rows.length, counts };
}

export function listSecurityGuilds() {
  return getDb().guilds;
}
