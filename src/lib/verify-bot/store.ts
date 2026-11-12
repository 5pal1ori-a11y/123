import { randomBytes, randomUUID } from "crypto";
import { getKvBinding } from "@/lib/db-persist";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { generateRecoveryKey, hashRecoveryKey, encryptSecret } from "@/lib/verify-bot/crypto";
import {
  defaultVerifyGuildLimits,
  defaultVerifyGuildPanel,
  emptyVerifyDb,
  todayKey,
  type VerifyAudit,
  type VerifyAuditAction,
  type VerifyDb,
  type VerifyEvent,
  type VerifyGuild,
  type VerifyGuildPatch,
  type VerifyMember,
  type VerifyPendingJoin,
} from "@/lib/verify-bot/types";

export const VERIFY_DB_KV_KEY = "vendix:verify-db";

const globalForVerify = globalThis as unknown as {
  __vendixVerifyDb?: VerifyDb;
  __vendixVerifyLoadedAt?: number;
};

const CACHE_TTL_MS = 5_000;

function markFresh() {
  globalForVerify.__vendixVerifyLoadedAt = Date.now();
}

function cacheValid() {
  const at = globalForVerify.__vendixVerifyLoadedAt ?? 0;
  return Boolean(globalForVerify.__vendixVerifyDb) && Date.now() - at < CACHE_TTL_MS;
}

function getDb(): VerifyDb {
  if (!globalForVerify.__vendixVerifyDb) {
    globalForVerify.__vendixVerifyDb = emptyVerifyDb();
  }
  return globalForVerify.__vendixVerifyDb;
}

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

function normalizeGuild(raw: Partial<VerifyGuild> & { guildId: string }): VerifyGuild {
  const limits = defaultVerifyGuildLimits();
  const panel = defaultVerifyGuildPanel();
  const planRaw = String(raw.planTier || panel.planTier);
  const planTier =
    planRaw === "free" || planRaw === "pro_max" || planRaw === "pro" ? planRaw : "pro";
  return {
    guildId: raw.guildId,
    guildName: raw.guildName || `서버-${raw.guildId.slice(-4)}`,
    adminPasswordHash: raw.adminPasswordHash || "",
    recoveryKeyHash: raw.recoveryKeyHash ?? null,
    planTier,
    enabled: raw.enabled !== false,
    verifiedRoleId: raw.verifiedRoleId ?? null,
    logChannelId: raw.logChannelId ?? null,
    logIp: raw.logIp !== false,
    logEmail: raw.logEmail !== false,
    requireEmail: Boolean(raw.requireEmail),
    requirePhoneLinked: Boolean(raw.requirePhoneLinked ?? panel.requirePhoneLinked),
    blockVpn: Boolean(raw.blockVpn ?? limits.blockVpn),
    blockProxy: Boolean(raw.blockProxy ?? limits.blockProxy),
    blockMobile: Boolean(raw.blockMobile ?? limits.blockMobile),
    blockForeign: Boolean(raw.blockForeign ?? limits.blockForeign),
    allowedCountries: Array.isArray(raw.allowedCountries)
      ? raw.allowedCountries.map((c) => String(c).toUpperCase()).filter(Boolean)
      : [...limits.allowedCountries],
    panelTitle: raw.panelTitle?.trim() || panel.panelTitle,
    panelDescription: raw.panelDescription?.trim() || panel.panelDescription,
    buttonLabel: raw.buttonLabel?.trim() || panel.buttonLabel,
    minAccountAgeDays: Math.max(0, Number(raw.minAccountAgeDays) || 0),
    maxVerifiesPerIpPerDay: Math.max(0, Number(raw.maxVerifiesPerIpPerDay) || 0),
    reverifyCooldownHours: Math.max(0, Number(raw.reverifyCooldownHours) || 0),
    kickUnverifiedMinutes: Math.max(0, Number(raw.kickUnverifiedMinutes) || 0),
    enableTurnstile: Boolean(raw.enableTurnstile ?? panel.enableTurnstile),
    trackSources: raw.trackSources !== false,
    blacklistUserIds: asStringList(raw.blacklistUserIds),
    blacklistIps: asStringList(raw.blacklistIps),
    whitelistIps: asStringList(raw.whitelistIps),
    webhookUrl: raw.webhookUrl?.trim() || null,
    dmOnVerify: Boolean(raw.dmOnVerify ?? panel.dmOnVerify),
    dmMessage: raw.dmMessage?.trim() || panel.dmMessage,
    logBlockedAttempts: raw.logBlockedAttempts !== false,
    blockDuplicateIp: Boolean(raw.blockDuplicateIp),
    lastMemberCount: Math.max(0, Number(raw.lastMemberCount) || 0),
    joinsToday: Number(raw.joinsToday) || 0,
    verifiesToday: Number(raw.verifiesToday) || 0,
    blockedToday: Number(raw.blockedToday) || 0,
    countersDate: raw.countersDate || todayKey(),
    verifyTotal: Number(raw.verifyTotal) || 0,
    blockedTotal: Number(raw.blockedTotal) || 0,
    registeredBy: raw.registeredBy ?? null,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

function normalizeEvent(raw: Partial<VerifyEvent> & { id: string; guildId: string }): VerifyEvent {
  return {
    id: raw.id,
    guildId: raw.guildId,
    guildName: raw.guildName ?? null,
    discordUserId: raw.discordUserId || "",
    username: raw.username || "unknown",
    email: raw.email ?? null,
    ip: raw.ip ?? null,
    userAgent: raw.userAgent ?? null,
    device: raw.device ?? null,
    country: raw.country ?? null,
    region: raw.region ?? null,
    isp: raw.isp ?? null,
    flags: Array.isArray(raw.flags) ? raw.flags.map(String) : [],
    status: raw.status === "blocked" ? "blocked" : "ok",
    reason: raw.reason ?? null,
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

function normalizeMember(
  raw: Partial<VerifyMember> & { guildId: string; discordUserId: string },
): VerifyMember {
  return {
    guildId: raw.guildId,
    discordUserId: raw.discordUserId,
    username: raw.username || "unknown",
    refreshTokenEnc: raw.refreshTokenEnc ?? null,
    verifyCount: Number(raw.verifyCount) || 1,
    lastIp: raw.lastIp ?? null,
    lastCountry: raw.lastCountry ?? null,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

function normalizeDb(raw: Partial<VerifyDb> | null): VerifyDb {
  return {
    guilds: Array.isArray(raw?.guilds)
      ? raw!.guilds!.filter((g) => g?.guildId).map((g) => normalizeGuild(g))
      : [],
    events: Array.isArray(raw?.events)
      ? raw!.events!.filter((e) => e?.id && e?.guildId).map((e) => normalizeEvent(e as VerifyEvent))
      : [],
    members: Array.isArray(raw?.members)
      ? raw!.members!
          .filter((m) => m?.guildId && m?.discordUserId)
          .map((m) => normalizeMember(m as VerifyMember))
      : [],
    audits: Array.isArray(raw?.audits) ? (raw!.audits as VerifyAudit[]) : [],
    pendingJoins: Array.isArray(raw?.pendingJoins)
      ? (raw!.pendingJoins as VerifyPendingJoin[])
      : [],
  };
}

export async function initVerifyStore() {
  if (cacheValid()) return getDb();
  try {
    const kv = await getKvBinding();
    if (kv) {
      const raw = await kv.get(VERIFY_DB_KV_KEY);
      if (raw) {
        globalForVerify.__vendixVerifyDb = normalizeDb(JSON.parse(raw) as Partial<VerifyDb>);
        markFresh();
        return getDb();
      }
    }
  } catch {
    /* empty */
  }
  if (!globalForVerify.__vendixVerifyDb) {
    globalForVerify.__vendixVerifyDb = emptyVerifyDb();
  }
  markFresh();
  return getDb();
}

export async function persistVerifyStore() {
  const db = getDb();
  try {
    const kv = await getKvBinding();
    if (kv) {
      await kv.put(VERIFY_DB_KV_KEY, JSON.stringify(db));
    }
  } catch (err) {
    console.error("[verify-bot] persist failed", err);
  }
  markFresh();
}

function rollCounters(guild: VerifyGuild) {
  const today = todayKey();
  if (guild.countersDate !== today) {
    guild.countersDate = today;
    guild.joinsToday = 0;
    guild.verifiesToday = 0;
    guild.blockedToday = 0;
  }
}

export function getVerifyGuild(guildId: string): VerifyGuild | null {
  return getDb().guilds.find((g) => g.guildId === guildId) ?? null;
}

export function findGuildByRecoveryKey(key: string): VerifyGuild | null {
  const hash = hashRecoveryKey(key);
  return getDb().guilds.find((g) => g.recoveryKeyHash && g.recoveryKeyHash === hash) ?? null;
}

export function listVerifyEvents(guildId: string, limit = 80): VerifyEvent[] {
  return getDb()
    .events.filter((e) => e.guildId === guildId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function listVerifyMembers(guildId: string): VerifyMember[] {
  return getDb().members.filter((m) => m.guildId === guildId);
}

export function registerVerifyGuild(input: {
  guildId: string;
  guildName: string;
  registeredBy: string;
}): { guild: VerifyGuild; password: string; recoveryKey: string; created: boolean } {
  const db = getDb();
  const password = randomBytes(6).toString("hex");
  const recoveryKey = generateRecoveryKey();
  const now = new Date().toISOString();
  const existing = db.guilds.find((g) => g.guildId === input.guildId);
  if (existing) {
    existing.adminPasswordHash = hashPassword(password);
    existing.recoveryKeyHash = hashRecoveryKey(recoveryKey);
    existing.guildName = input.guildName || existing.guildName;
    existing.registeredBy = input.registeredBy;
    existing.updatedAt = now;
    existing.enabled = true;
    rollCounters(existing);
    return { guild: existing, password, recoveryKey, created: false };
  }

  const guild: VerifyGuild = normalizeGuild({
    guildId: input.guildId,
    guildName: input.guildName || `서버-${input.guildId.slice(-4)}`,
    adminPasswordHash: hashPassword(password),
    recoveryKeyHash: hashRecoveryKey(recoveryKey),
    registeredBy: input.registeredBy,
    createdAt: now,
    updatedAt: now,
  });
  db.guilds.unshift(guild);
  return { guild, password, recoveryKey, created: true };
}

export function verifyGuildLogin(guildId: string, password: string): VerifyGuild | null {
  const guild = getVerifyGuild(guildId);
  if (!guild) return null;
  if (!verifyPassword(password, guild.adminPasswordHash)) return null;
  return guild;
}

export function updateVerifyGuild(guildId: string, patch: VerifyGuildPatch): VerifyGuild | null {
  const guild = getVerifyGuild(guildId);
  if (!guild) return null;
  Object.assign(guild, patch);
  if (patch.allowedCountries) {
    guild.allowedCountries = patch.allowedCountries.map((c) => c.toUpperCase()).filter(Boolean);
  }
  if (patch.blacklistUserIds) guild.blacklistUserIds = asStringList(patch.blacklistUserIds);
  if (patch.blacklistIps) guild.blacklistIps = asStringList(patch.blacklistIps);
  if (patch.whitelistIps) guild.whitelistIps = asStringList(patch.whitelistIps);
  if (patch.webhookUrl !== undefined) {
    guild.webhookUrl = patch.webhookUrl?.trim() || null;
  }
  if (patch.kickUnverifiedMinutes !== undefined) {
    guild.kickUnverifiedMinutes = Math.max(0, Number(patch.kickUnverifiedMinutes) || 0);
  }
  guild.updatedAt = new Date().toISOString();
  rollCounters(guild);
  return guild;
}

export function setVerifyGuildPassword(guildId: string, newPassword: string): boolean {
  const guild = getVerifyGuild(guildId);
  if (!guild || newPassword.length < 4) return false;
  guild.adminPasswordHash = hashPassword(newPassword);
  guild.updatedAt = new Date().toISOString();
  return true;
}

export function rotateVerifyRecoveryKey(guildId: string): string | null {
  const guild = getVerifyGuild(guildId);
  if (!guild) return null;
  const key = generateRecoveryKey();
  guild.recoveryKeyHash = hashRecoveryKey(key);
  guild.updatedAt = new Date().toISOString();
  return key;
}

export function removeVerifyMember(guildId: string, discordUserId: string): boolean {
  const db = getDb();
  const before = db.members.length;
  db.members = db.members.filter(
    (m) => !(m.guildId === guildId && m.discordUserId === discordUserId),
  );
  return db.members.length < before;
}

export function clearVerifyEvents(guildId: string) {
  const db = getDb();
  db.events = db.events.filter((e) => e.guildId !== guildId);
}

export function upsertVerifyMember(input: {
  guildId: string;
  discordUserId: string;
  username: string;
  refreshToken: string | null;
  ip?: string | null;
  country?: string | null;
}) {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db.members.find(
    (m) => m.guildId === input.guildId && m.discordUserId === input.discordUserId,
  );
  const enc = input.refreshToken ? encryptSecret(input.refreshToken) : null;
  if (existing) {
    existing.username = input.username;
    if (enc) existing.refreshTokenEnc = enc;
    existing.verifyCount = (existing.verifyCount || 0) + 1;
    if (input.ip) existing.lastIp = input.ip;
    if (input.country) existing.lastCountry = input.country;
    existing.updatedAt = now;
    return existing;
  }
  const member: VerifyMember = {
    guildId: input.guildId,
    discordUserId: input.discordUserId,
    username: input.username,
    refreshTokenEnc: enc,
    verifyCount: 1,
    lastIp: input.ip ?? null,
    lastCountry: input.country ?? null,
    createdAt: now,
    updatedAt: now,
  };
  db.members.unshift(member);
  return member;
}

function pushEvent(event: VerifyEvent) {
  getDb().events.unshift(event);
  if (getDb().events.length > 3000) {
    getDb().events = getDb().events.slice(0, 3000);
  }
}

export function recordVerifySuccess(input: {
  guildId: string;
  guildName?: string | null;
  discordUserId: string;
  username: string;
  email: string | null;
  ip: string | null;
  userAgent: string | null;
  device?: string | null;
  country: string | null;
  region?: string | null;
  isp?: string | null;
  flags: string[];
  refreshToken: string | null;
}): VerifyEvent | null {
  const guild = getVerifyGuild(input.guildId);
  if (!guild) return null;
  rollCounters(guild);
  guild.verifiesToday += 1;
  guild.verifyTotal += 1;
  guild.updatedAt = new Date().toISOString();

  upsertVerifyMember({
    guildId: input.guildId,
    discordUserId: input.discordUserId,
    username: input.username,
    refreshToken: input.refreshToken,
    ip: input.ip,
    country: input.country,
  });

  const event: VerifyEvent = {
    id: randomUUID(),
    guildId: input.guildId,
    guildName: input.guildName ?? guild.guildName ?? null,
    discordUserId: input.discordUserId,
    username: input.username,
    email: input.email,
    ip: input.ip,
    userAgent: input.userAgent,
    device: input.device ?? null,
    country: input.country,
    region: input.region ?? null,
    isp: input.isp ?? null,
    flags: input.flags,
    status: "ok",
    reason: null,
    createdAt: new Date().toISOString(),
  };
  pushEvent(event);
  return event;
}

export function recordVerifyBlocked(input: {
  guildId: string;
  guildName?: string | null;
  discordUserId: string;
  username: string;
  email?: string | null;
  ip: string | null;
  userAgent: string | null;
  device?: string | null;
  country: string | null;
  region?: string | null;
  isp?: string | null;
  flags: string[];
  reason: string;
}): VerifyEvent | null {
  const guild = getVerifyGuild(input.guildId);
  if (!guild) return null;
  rollCounters(guild);
  guild.blockedToday += 1;
  guild.blockedTotal += 1;
  guild.updatedAt = new Date().toISOString();
  if (!guild.logBlockedAttempts) return null;

  const event: VerifyEvent = {
    id: randomUUID(),
    guildId: input.guildId,
    guildName: input.guildName ?? guild.guildName ?? null,
    discordUserId: input.discordUserId,
    username: input.username,
    email: input.email ?? null,
    ip: input.ip,
    userAgent: input.userAgent,
    device: input.device ?? null,
    country: input.country,
    region: input.region ?? null,
    isp: input.isp ?? null,
    flags: input.flags,
    status: "blocked",
    reason: input.reason,
    createdAt: new Date().toISOString(),
  };
  pushEvent(event);
  return event;
}

export function countIpVerifiesToday(guildId: string, ip: string | null) {
  if (!ip) return 0;
  const today = todayKey();
  return getDb().events.filter(
    (e) =>
      e.guildId === guildId &&
      e.status === "ok" &&
      e.ip === ip &&
      e.createdAt.slice(0, 10) === today,
  ).length;
}

export function findMemberByUser(guildId: string, userId: string) {
  return getDb().members.find((m) => m.guildId === guildId && m.discordUserId === userId) ?? null;
}

export function findOtherMemberWithIp(guildId: string, ip: string, excludeUserId: string) {
  return (
    getDb().members.find(
      (m) => m.guildId === guildId && m.lastIp === ip && m.discordUserId !== excludeUserId,
    ) ?? null
  );
}

export function bumpJoinCounter(guildId: string) {
  const guild = getVerifyGuild(guildId);
  if (!guild) return;
  rollCounters(guild);
  guild.joinsToday += 1;
  guild.updatedAt = new Date().toISOString();
}

export function countryBreakdown(guildId: string, limit = 8) {
  const map = new Map<string, number>();
  for (const e of getDb().events) {
    if (e.guildId !== guildId || e.status !== "ok" || !e.country) continue;
    map.set(e.country, (map.get(e.country) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([country, count]) => ({ country, count }));
}

export function publicGuildStats(guild: VerifyGuild) {
  rollCounters(guild);
  const members = listVerifyMembers(guild.guildId);
  return {
    guildId: guild.guildId,
    guildName: guild.guildName,
    planTier: guild.planTier,
    enabled: guild.enabled,
    verifiedRoleId: guild.verifiedRoleId,
    logChannelId: guild.logChannelId,
    logIp: guild.logIp,
    logEmail: guild.logEmail,
    requireEmail: guild.requireEmail,
    requirePhoneLinked: guild.requirePhoneLinked,
    blockVpn: guild.blockVpn,
    blockProxy: guild.blockProxy,
    blockMobile: guild.blockMobile,
    blockForeign: guild.blockForeign,
    allowedCountries: guild.allowedCountries,
    panelTitle: guild.panelTitle,
    panelDescription: guild.panelDescription,
    buttonLabel: guild.buttonLabel,
    minAccountAgeDays: guild.minAccountAgeDays,
    maxVerifiesPerIpPerDay: guild.maxVerifiesPerIpPerDay,
    reverifyCooldownHours: guild.reverifyCooldownHours,
    kickUnverifiedMinutes: guild.kickUnverifiedMinutes,
    enableTurnstile: guild.enableTurnstile,
    trackSources: guild.trackSources,
    blacklistUserIds: guild.blacklistUserIds,
    blacklistIps: guild.blacklistIps,
    whitelistIps: guild.whitelistIps,
    webhookUrl: guild.webhookUrl,
    dmOnVerify: guild.dmOnVerify,
    dmMessage: guild.dmMessage,
    logBlockedAttempts: guild.logBlockedAttempts,
    blockDuplicateIp: guild.blockDuplicateIp,
    hasRecoveryKey: Boolean(guild.recoveryKeyHash),
    joinsToday: guild.joinsToday,
    verifiesToday: guild.verifiesToday,
    blockedToday: guild.blockedToday,
    verifyTotal: guild.verifyTotal,
    blockedTotal: guild.blockedTotal,
    memberCount: members.length,
    recoverableCount: members.filter((m) => m.refreshTokenEnc).length,
    countries: countryBreakdown(guild.guildId),
    countersDate: guild.countersDate,
    createdAt: guild.createdAt,
    updatedAt: guild.updatedAt,
  };
}

export function publicMembers(guildId: string) {
  return listVerifyMembers(guildId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((m) => ({
      discordUserId: m.discordUserId,
      username: m.username,
      verifyCount: m.verifyCount,
      lastIp: m.lastIp,
      lastCountry: m.lastCountry,
      recoverable: Boolean(m.refreshTokenEnc),
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    }));
}

/** Discord snowflake → account created At ms */
export function discordAccountCreatedAt(userId: string): number | null {
  try {
    const id = BigInt(userId);
    return Number((id >> BigInt(22)) + BigInt(1_420_070_400_000));
  } catch {
    return null;
  }
}

export function appendVerifyAudit(input: {
  guildId: string;
  action: VerifyAuditAction;
  actor: string;
  ip?: string | null;
  detail?: string | null;
}) {
  const row: VerifyAudit = {
    id: randomUUID(),
    guildId: input.guildId,
    action: input.action,
    actor: input.actor,
    ip: input.ip ?? null,
    detail: input.detail ?? null,
    createdAt: new Date().toISOString(),
  };
  getDb().audits.unshift(row);
  if (getDb().audits.length > 4000) {
    getDb().audits = getDb().audits.slice(0, 4000);
  }
  return row;
}

export function listVerifyAudits(guildId: string, limit = 80): VerifyAudit[] {
  return getDb()
    .audits.filter((a) => a.guildId === guildId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function listAllVerifyGuilds(): VerifyGuild[] {
  return getDb().guilds;
}

export function upsertPendingJoin(input: {
  guildId: string;
  discordUserId: string;
  username: string;
  joinedAt?: string;
}) {
  const db = getDb();
  const existing = db.pendingJoins.find(
    (p) => p.guildId === input.guildId && p.discordUserId === input.discordUserId,
  );
  if (existing) return existing;
  // already verified → skip
  if (findMemberByUser(input.guildId, input.discordUserId)) return null;
  const row: VerifyPendingJoin = {
    guildId: input.guildId,
    discordUserId: input.discordUserId,
    username: input.username,
    joinedAt: input.joinedAt || new Date().toISOString(),
  };
  db.pendingJoins.unshift(row);
  return row;
}

export function removePendingJoin(guildId: string, userId: string) {
  const db = getDb();
  db.pendingJoins = db.pendingJoins.filter(
    (p) => !(p.guildId === guildId && p.discordUserId === userId),
  );
}

export function listPendingJoins(guildId: string) {
  return getDb().pendingJoins.filter((p) => p.guildId === guildId);
}

export function applyMemberCountDelta(guildId: string, memberCount: number) {
  const guild = getVerifyGuild(guildId);
  if (!guild || memberCount < 0) return;
  rollCounters(guild);
  if (guild.lastMemberCount > 0 && memberCount > guild.lastMemberCount) {
    guild.joinsToday += memberCount - guild.lastMemberCount;
  }
  guild.lastMemberCount = memberCount;
  guild.updatedAt = new Date().toISOString();
}

export function addBlacklistUser(guildId: string, userId: string) {
  const guild = getVerifyGuild(guildId);
  if (!guild) return null;
  if (!guild.blacklistUserIds.includes(userId)) {
    guild.blacklistUserIds = [...guild.blacklistUserIds, userId];
  }
  guild.updatedAt = new Date().toISOString();
  return guild;
}

export function removeBlacklistUser(guildId: string, userId: string) {
  const guild = getVerifyGuild(guildId);
  if (!guild) return null;
  guild.blacklistUserIds = guild.blacklistUserIds.filter((id) => id !== userId);
  guild.updatedAt = new Date().toISOString();
  return guild;
}
