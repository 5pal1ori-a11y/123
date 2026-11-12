import { randomBytes, randomUUID } from "crypto";
import { getKvBinding } from "@/lib/db-persist";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { emptyEmbedDraft } from "@/lib/manage-bot/embed";
import {
  defaultManageGuild,
  emptyManageDb,
  type ManageAudit,
  type ManageBanner,
  type ManageBannerLicense,
  type ManageDb,
  type ManageEmbedDraft,
  type ManageGuild,
  type ManageGuildPatch,
  type ManagePartnerSendLog,
  type ManagePartnerWebhook,
} from "@/lib/manage-bot/types";

export const MANAGE_DB_KV_KEY = "vendix:manage-db";

const globalForManage = globalThis as unknown as {
  __vendixManageDb?: ManageDb;
  __vendixManageLoadedAt?: number;
};

const CACHE_TTL_MS = 5_000;

function markFresh() {
  globalForManage.__vendixManageLoadedAt = Date.now();
}

function cacheValid() {
  const at = globalForManage.__vendixManageLoadedAt ?? 0;
  return Boolean(globalForManage.__vendixManageDb) && Date.now() - at < CACHE_TTL_MS;
}

function getDb(): ManageDb {
  if (!globalForManage.__vendixManageDb) {
    globalForManage.__vendixManageDb = emptyManageDb();
  }
  const db = globalForManage.__vendixManageDb;
  if (!Array.isArray(db.embeds)) db.embeds = [];
  return db;
}

function newerIso(a?: string | null, b?: string | null) {
  return (a || "") >= (b || "") ? a || null : b || null;
}

function normalizeEmbedDraft(raw: Partial<ManageEmbedDraft> | null | undefined): ManageEmbedDraft | null {
  if (!raw?.id || !raw.guildId) return null;
  return {
    id: String(raw.id),
    guildId: String(raw.guildId),
    ownerDiscordId: String(raw.ownerDiscordId || ""),
    content: String(raw.content || ""),
    title: String(raw.title || ""),
    url: String(raw.url || ""),
    description: String(raw.description || ""),
    color: String(raw.color || ""),
    authorName: String(raw.authorName || ""),
    authorUrl: String(raw.authorUrl || ""),
    authorIcon: String(raw.authorIcon || ""),
    footerText: String(raw.footerText || ""),
    footerIcon: String(raw.footerIcon || ""),
    thumbnailUrl: String(raw.thumbnailUrl || ""),
    imageUrl: String(raw.imageUrl || ""),
    timestamp: Boolean(raw.timestamp),
    fields: Array.isArray(raw.fields)
      ? raw.fields.map((f) => ({
          name: String(f?.name || "").slice(0, 256),
          value: String(f?.value || "").slice(0, 1024),
          inline: Boolean(f?.inline),
        }))
      : [],
    targetChannelId: raw.targetChannelId ? String(raw.targetChannelId) : null,
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

function normalizeLicense(raw: Partial<ManageBannerLicense>): ManageBannerLicense | null {
  if (!raw?.id || !raw.code) return null;
  return {
    id: String(raw.id),
    guildId: String(raw.guildId || ""),
    code: String(raw.code),
    days: Math.max(1, Number(raw.days) || 1),
    createdAt: raw.createdAt || new Date().toISOString(),
    createdBy: String(raw.createdBy || ""),
    redeemedAt: raw.redeemedAt || null,
    redeemedBy: raw.redeemedBy || null,
    bannerId: raw.bannerId || null,
  };
}

function pickRedeemedLicense(a: ManageBannerLicense, b: ManageBannerLicense): ManageBannerLicense {
  const redeemedAt = newerIso(a.redeemedAt, b.redeemedAt);
  const winner = (b.redeemedAt || "") > (a.redeemedAt || "") ? b : a;
  return {
    ...winner,
    redeemedAt,
    redeemedBy: winner.redeemedBy || a.redeemedBy || b.redeemedBy,
    bannerId: winner.bannerId || a.bannerId || b.bannerId,
  };
}

function mergeByKey<T>(remote: T[], local: T[], key: (row: T) => string, pick: (a: T, b: T) => T): T[] {
  const map = new Map<string, T>();
  for (const row of remote) {
    const k = key(row);
    if (k) map.set(k, row);
  }
  for (const row of local) {
    const k = key(row);
    if (!k) continue;
    const prev = map.get(k);
    map.set(k, prev ? pick(prev, row) : row);
  }
  return [...map.values()];
}

function repairLicensesFromBanners(db: ManageDb) {
  const byLicense = new Map<string, ManageBanner>();
  for (const b of db.banners) {
    if (b.licenseId && !byLicense.has(b.licenseId)) byLicense.set(b.licenseId, b);
  }
  for (const lic of db.licenses) {
    const banner = byLicense.get(lic.id);
    if (!banner) continue;
    if (!lic.redeemedAt) lic.redeemedAt = banner.createdAt;
    if (!lic.redeemedBy) lic.redeemedBy = banner.ownerDiscordId;
    if (!lic.bannerId) lic.bannerId = banner.id;
  }
}

function mergeManageDb(remote: Partial<ManageDb>, local: ManageDb): ManageDb {
  const remoteGuilds = Array.isArray(remote.guilds) ? remote.guilds.map((g) => normalizeGuild(g)) : [];
  const remoteLicenses = Array.isArray(remote.licenses)
    ? remote.licenses.map(normalizeLicense).filter((l): l is ManageBannerLicense => Boolean(l))
    : [];
  const merged: ManageDb = {
    guilds: mergeByKey(remoteGuilds, local.guilds, (g) => g.guildId, (a, b) =>
      (b.updatedAt || "") >= (a.updatedAt || "") ? b : a,
    ),
    licenses: mergeByKey(remoteLicenses, local.licenses, (l) => l.id, pickRedeemedLicense),
    banners: mergeByKey(Array.isArray(remote.banners) ? remote.banners : [], local.banners, (b) => b.id, (a, b) =>
      a.status === "expired" || a.status === "deleted" ? a : b,
    ),
    webhooks: mergeByKey(
      Array.isArray(remote.webhooks) ? remote.webhooks : [],
      local.webhooks,
      (w) => w.id,
      (_a, b) => b,
    ),
    partnerLogs: mergeByKey(
      Array.isArray(remote.partnerLogs) ? remote.partnerLogs : [],
      local.partnerLogs,
      (l) => l.id,
      (_a, b) => b,
    ),
    audits: mergeByKey(Array.isArray(remote.audits) ? remote.audits : [], local.audits, (a) => a.id, (_a, b) => b),
    embeds: mergeByKey(
      Array.isArray(remote.embeds) ? remote.embeds.map(normalizeEmbedDraft).filter((e): e is ManageEmbedDraft => Boolean(e)) : [],
      local.embeds || [],
      (e) => e.id,
      (a, b) => ((b.updatedAt || "") >= (a.updatedAt || "") ? b : a),
    ),
  };
  merged.partnerLogs.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  if (merged.partnerLogs.length > 300) merged.partnerLogs.length = 300;
  merged.audits.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (merged.audits.length > 500) merged.audits.length = 500;
  merged.embeds.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  if (merged.embeds.length > 80) merged.embeds.length = 80;
  repairLicensesFromBanners(merged);
  return merged;
}

function normalizeGuild(raw: Partial<ManageGuild> & { guildId: string }): ManageGuild {
  const d = defaultManageGuild(raw.guildId, raw.guildName || `서버-${raw.guildId.slice(-4)}`);
  return {
    ...d,
    ...raw,
    guildId: raw.guildId,
    guildName: raw.guildName || d.guildName,
    adminPasswordHash: raw.adminPasswordHash || "",
    adminPasswordPlain: typeof raw.adminPasswordPlain === "string" ? raw.adminPasswordPlain : "",
    enabled: raw.enabled !== false,
    bannerCategoryId: raw.bannerCategoryId ?? null,
    bannerChannelPrefix: raw.bannerChannelPrefix ?? d.bannerChannelPrefix,
    bannerPanelTitle: raw.bannerPanelTitle || d.bannerPanelTitle,
    bannerPanelDescription: raw.bannerPanelDescription || d.bannerPanelDescription,
    bannerButtonLabel: raw.bannerButtonLabel || d.bannerButtonLabel,
    partnerMessage: raw.partnerMessage ?? d.partnerMessage,
    partnerWebhookName: raw.partnerWebhookName || d.partnerWebhookName,
    partnerWebhookAvatarUrl: raw.partnerWebhookAvatarUrl ?? null,
    partnerEnabled: Boolean(raw.partnerEnabled),
    partnerHourKst: Math.min(23, Math.max(0, Number(raw.partnerHourKst) || 12)),
    partnerMinuteKst: Math.min(59, Math.max(0, Number(raw.partnerMinuteKst) || 0)),
    partnerLastSentDateKst: raw.partnerLastSentDateKst ?? null,
    registeredBy: raw.registeredBy ?? null,
    createdAt: raw.createdAt || d.createdAt,
    updatedAt: raw.updatedAt || d.updatedAt,
  };
}

export async function initManageStore(opts?: { force?: boolean }) {
  if (!opts?.force && cacheValid()) return getDb();
  try {
    const kv = await getKvBinding();
    if (kv) {
      const rawText = await kv.get(MANAGE_DB_KV_KEY);
      if (rawText) {
        const data = JSON.parse(rawText) as Partial<ManageDb>;
        const db: ManageDb = {
          guilds: Array.isArray(data.guilds) ? data.guilds.map((g) => normalizeGuild(g)) : [],
          licenses: Array.isArray(data.licenses)
            ? data.licenses.map(normalizeLicense).filter((l): l is ManageBannerLicense => Boolean(l))
            : [],
          banners: Array.isArray(data.banners) ? data.banners : [],
          webhooks: Array.isArray(data.webhooks) ? data.webhooks : [],
          partnerLogs: Array.isArray(data.partnerLogs) ? data.partnerLogs : [],
          audits: Array.isArray(data.audits) ? data.audits : [],
          embeds: Array.isArray(data.embeds)
            ? data.embeds.map(normalizeEmbedDraft).filter((e): e is ManageEmbedDraft => Boolean(e))
            : [],
        };
        repairLicensesFromBanners(db);
        globalForManage.__vendixManageDb = db;
        markFresh();
        return getDb();
      }
    }
  } catch (err) {
    console.error("[manage-bot] load failed", err);
  }
  if (!globalForManage.__vendixManageDb) {
    globalForManage.__vendixManageDb = emptyManageDb();
  }
  markFresh();
  return getDb();
}

export async function persistManageStore(opts?: { skipMerge?: boolean }) {
  const local = getDb();
  try {
    const kv = await getKvBinding();
    if (kv) {
      if (!opts?.skipMerge) {
        const rawText = await kv.get(MANAGE_DB_KV_KEY);
        if (rawText) {
          try {
            const remote = JSON.parse(rawText) as Partial<ManageDb>;
            globalForManage.__vendixManageDb = mergeManageDb(remote, local);
          } catch {
            /* keep local */
          }
        }
      }
      await kv.put(MANAGE_DB_KV_KEY, JSON.stringify(getDb()));
    }
  } catch (err) {
    console.error("[manage-bot] persist failed", err);
  }
  markFresh();
}

function randomPassword(len = 12) {
  return randomBytes(Math.ceil(len / 2))
    .toString("hex")
    .slice(0, len);
}

function licenseCode() {
  return `BNR-${randomBytes(3).toString("hex").toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

export function listAllManageGuilds() {
  return getDb().guilds;
}

export function getManageGuild(guildId: string) {
  return getDb().guilds.find((g) => g.guildId === guildId) ?? null;
}

export function registerManageGuild(input: {
  guildId: string;
  guildName: string;
  registeredBy?: string | null;
}) {
  const db = getDb();
  const existing = db.guilds.find((g) => g.guildId === input.guildId);
  if (existing) {
    existing.guildName = input.guildName || existing.guildName;
    existing.updatedAt = new Date().toISOString();
    if (input.registeredBy) existing.registeredBy = input.registeredBy;
    return { guild: existing, password: existing.adminPasswordPlain || "(기존)", recoveryKey: null as string | null, created: false };
  }
  const password = randomPassword(14);
  const guild = defaultManageGuild(input.guildId, input.guildName);
  guild.adminPasswordHash = hashPassword(password);
  guild.adminPasswordPlain = password;
  guild.registeredBy = input.registeredBy ?? null;
  db.guilds.push(guild);
  return { guild, password, recoveryKey: null as string | null, created: true };
}

export function updateManageGuild(guildId: string, patch: ManageGuildPatch) {
  const guild = getManageGuild(guildId);
  if (!guild) return null;
  Object.assign(guild, patch);
  if (patch.partnerHourKst !== undefined) {
    guild.partnerHourKst = Math.min(23, Math.max(0, Math.floor(patch.partnerHourKst)));
  }
  if (patch.partnerMinuteKst !== undefined) {
    guild.partnerMinuteKst = Math.min(59, Math.max(0, Math.floor(patch.partnerMinuteKst)));
  }
  guild.updatedAt = new Date().toISOString();
  return guild;
}

export function setManageGuildPassword(guildId: string, password: string) {
  const guild = getManageGuild(guildId);
  if (!guild) return false;
  guild.adminPasswordHash = hashPassword(password);
  guild.adminPasswordPlain = password;
  guild.updatedAt = new Date().toISOString();
  return true;
}

export function verifyManageGuildLogin(guildId: string, password: string) {
  const guild = getManageGuild(guildId);
  if (!guild?.adminPasswordHash) return false;
  return verifyPassword(password, guild.adminPasswordHash);
}

export function appendManageAudit(input: {
  guildId: string;
  actor: string;
  action: string;
  detail: string;
}) {
  const row: ManageAudit = {
    id: randomUUID(),
    guildId: input.guildId,
    actor: input.actor,
    action: input.action,
    detail: input.detail.slice(0, 500),
    createdAt: new Date().toISOString(),
  };
  const db = getDb();
  db.audits.unshift(row);
  if (db.audits.length > 500) db.audits.length = 500;
  return row;
}

export function listManageAudits(guildId: string, limit = 40) {
  return getDb()
    .audits.filter((a) => a.guildId === guildId)
    .slice(0, limit);
}

export function issueBannerLicenses(input: {
  guildId: string;
  days: number;
  count: number;
  createdBy: string;
}) {
  const days = Math.min(365, Math.max(1, Math.floor(input.days)));
  const count = Math.min(50, Math.max(1, Math.floor(input.count)));
  const db = getDb();
  const created: ManageBannerLicense[] = [];
  for (let i = 0; i < count; i++) {
    const lic: ManageBannerLicense = {
      id: randomUUID(),
      guildId: input.guildId,
      code: licenseCode(),
      days,
      createdAt: new Date().toISOString(),
      createdBy: input.createdBy,
      redeemedAt: null,
      redeemedBy: null,
      bannerId: null,
    };
    db.licenses.unshift(lic);
    created.push(lic);
  }
  return created;
}

export function listBannerLicenses(guildId: string) {
  return getDb()
    .licenses.filter((l) => l.guildId === guildId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getBannerLicenseByCode(guildId: string, code: string) {
  const c = code.trim().toUpperCase();
  return (
    getDb().licenses.find((l) => l.guildId === guildId && l.code.toUpperCase() === c) ?? null
  );
}

export function listBanners(guildId: string, status?: ManageBanner["status"]) {
  return getDb()
    .banners.filter((b) => b.guildId === guildId && (!status || b.status === status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getBannerById(bannerId: string) {
  return getDb().banners.find((b) => b.id === bannerId) ?? null;
}

export function listOwnerActiveBanners(guildId: string, ownerDiscordId: string) {
  return listBanners(guildId, "active").filter((b) => b.ownerDiscordId === ownerDiscordId);
}

export function updateBannerDisplay(input: {
  bannerId: string;
  displayName: string;
  channelName: string;
}) {
  const b = getBannerById(input.bannerId);
  if (!b || b.status !== "active") return null;
  b.displayName = input.displayName;
  b.channelName = input.channelName;
  return b;
}

export function createBannerRecord(input: {
  guildId: string;
  licenseId: string;
  channelId: string;
  channelName: string;
  displayName: string;
  ownerDiscordId: string;
  ownerUsername: string;
  days: number;
}): ManageBanner {
  const now = Date.now();
  const banner: ManageBanner = {
    id: randomUUID(),
    guildId: input.guildId,
    licenseId: input.licenseId,
    channelId: input.channelId,
    channelName: input.channelName,
    displayName: input.displayName,
    ownerDiscordId: input.ownerDiscordId,
    ownerUsername: input.ownerUsername,
    expiresAt: new Date(now + input.days * 24 * 60 * 60 * 1000).toISOString(),
    status: "active",
    createdAt: new Date(now).toISOString(),
  };
  const db = getDb();
  db.banners.unshift(banner);
  const lic =
    db.licenses.find((l) => l.id === input.licenseId) ||
    db.licenses.find((l) => l.bannerId === banner.id);
  if (lic) {
    lic.redeemedAt = lic.redeemedAt || banner.createdAt;
    lic.redeemedBy = lic.redeemedBy || input.ownerDiscordId;
    lic.bannerId = banner.id;
  }
  return banner;
}

export function consumeBannerLicense(input: {
  licenseId: string;
  ownerDiscordId: string;
}) {
  const lic = getDb().licenses.find((l) => l.id === input.licenseId);
  if (!lic) return false;
  lic.redeemedAt = lic.redeemedAt || new Date().toISOString();
  lic.redeemedBy = input.ownerDiscordId;
  return true;
}

export function releaseBannerLicense(licenseId: string) {
  const lic = getDb().licenses.find((l) => l.id === licenseId);
  if (!lic) return;
  lic.redeemedAt = null;
  lic.redeemedBy = null;
  lic.bannerId = null;
}

export function markBannerExpired(bannerId: string) {
  const b = getDb().banners.find((x) => x.id === bannerId);
  if (!b || b.status !== "active") return null;
  b.status = "expired";
  return b;
}

export function listPartnerWebhooks(guildId: string) {
  return getDb().webhooks.filter((w) => w.guildId === guildId);
}

export function addPartnerWebhook(input: {
  guildId: string;
  url: string;
  label?: string;
}) {
  const url = input.url.trim();
  if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//i.test(url)) {
    return { ok: false as const, error: "유효한 Discord 웹훅 URL이 아니에요." };
  }
  const db = getDb();
  if (db.webhooks.some((w) => w.guildId === input.guildId && w.url === url)) {
    return { ok: false as const, error: "이미 등록된 웹훅이에요." };
  }
  const row: ManagePartnerWebhook = {
    id: randomUUID(),
    guildId: input.guildId,
    label: (input.label || "웹훅").slice(0, 40),
    url,
    enabled: true,
    lastSentAt: null,
    lastError: null,
    createdAt: new Date().toISOString(),
  };
  db.webhooks.unshift(row);
  return { ok: true as const, webhook: row };
}

export function removePartnerWebhook(guildId: string, webhookId: string) {
  const db = getDb();
  const idx = db.webhooks.findIndex((w) => w.guildId === guildId && w.id === webhookId);
  if (idx < 0) return false;
  db.webhooks.splice(idx, 1);
  return true;
}

export function updatePartnerWebhook(
  guildId: string,
  webhookId: string,
  patch: Partial<Pick<ManagePartnerWebhook, "label" | "enabled" | "url">>,
) {
  const w = getDb().webhooks.find((x) => x.guildId === guildId && x.id === webhookId);
  if (!w) return null;
  if (patch.label !== undefined) w.label = patch.label.slice(0, 40);
  if (patch.enabled !== undefined) w.enabled = patch.enabled;
  if (patch.url !== undefined) {
    const url = patch.url.trim();
    if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//i.test(url)) return null;
    w.url = url;
  }
  return w;
}

export function appendPartnerSendLog(input: Omit<ManagePartnerSendLog, "id">) {
  const row: ManagePartnerSendLog = { ...input, id: randomUUID() };
  const db = getDb();
  db.partnerLogs.unshift(row);
  if (db.partnerLogs.length > 300) db.partnerLogs.length = 300;
  return row;
}

export function listPartnerSendLogs(guildId: string, limit = 40) {
  return getDb()
    .partnerLogs.filter((l) => l.guildId === guildId)
    .slice(0, limit);
}

export function publicManageStats(guildId: string) {
  const licenses = listBannerLicenses(guildId);
  const banners = listBanners(guildId);
  const webhooks = listPartnerWebhooks(guildId);
  return {
    licenseTotal: licenses.length,
    licenseUnused: licenses.filter((l) => !l.redeemedAt).length,
    bannerActive: banners.filter((b) => b.status === "active").length,
    bannerExpired: banners.filter((b) => b.status === "expired").length,
    webhookCount: webhooks.length,
    webhookEnabled: webhooks.filter((w) => w.enabled).length,
  };
}

export function getEmbedDraft(id: string) {
  return getDb().embeds.find((e) => e.id === id) ?? null;
}

export function getUserEmbedDraft(guildId: string, ownerDiscordId: string) {
  return (
    getDb()
      .embeds.filter((e) => e.guildId === guildId && e.ownerDiscordId === ownerDiscordId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
  );
}

export function upsertUserEmbedDraft(input: {
  guildId: string;
  ownerDiscordId: string;
  targetChannelId?: string | null;
}) {
  const existing = getUserEmbedDraft(input.guildId, input.ownerDiscordId);
  if (existing) {
    if (input.targetChannelId && !existing.targetChannelId) {
      existing.targetChannelId = input.targetChannelId;
      existing.updatedAt = new Date().toISOString();
    }
    return existing;
  }
  const draft = emptyEmbedDraft({
    id: randomBytes(4).toString("hex"),
    guildId: input.guildId,
    ownerDiscordId: input.ownerDiscordId,
    targetChannelId: input.targetChannelId ?? null,
  });
  const db = getDb();
  db.embeds.unshift(draft);
  if (db.embeds.length > 80) db.embeds.length = 80;
  return draft;
}

export function patchEmbedDraft(id: string, patch: Partial<ManageEmbedDraft>) {
  const draft = getEmbedDraft(id);
  if (!draft) return null;
  Object.assign(draft, patch, { id: draft.id, guildId: draft.guildId, ownerDiscordId: draft.ownerDiscordId });
  if (patch.fields) draft.fields = patch.fields.slice(0, 25);
  draft.updatedAt = new Date().toISOString();
  return draft;
}

export function resetEmbedDraft(id: string) {
  const draft = getEmbedDraft(id);
  if (!draft) return null;
  const next = emptyEmbedDraft({
    id: draft.id,
    guildId: draft.guildId,
    ownerDiscordId: draft.ownerDiscordId,
    targetChannelId: draft.targetChannelId,
  });
  Object.assign(draft, next);
  return draft;
}
