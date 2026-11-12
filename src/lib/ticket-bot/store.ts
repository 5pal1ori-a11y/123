import { randomBytes, randomUUID } from "crypto";
import { getKvBinding } from "@/lib/db-persist";
import { hashPassword, verifyPassword } from "@/lib/auth";
import {
  defaultTicketGuildPanel,
  defaultTicketTopics,
  emptyTicketDb,
  slugifyUsername,
  type TicketAudit,
  type TicketCloseReason,
  type TicketDb,
  type TicketGuild,
  type TicketGuildPatch,
  type TicketMacro,
  type TicketRecord,
  type TicketTopic,
  type TicketTranscript,
  type TranscriptMessage,
} from "@/lib/ticket-bot/types";

export const TICKET_DB_KV_KEY = "vendix:ticket-db";

const globalForTicket = globalThis as unknown as {
  __vendixTicketDb?: TicketDb;
  __vendixTicketLoadedAt?: number;
};

const CACHE_TTL_MS = 5_000;

function markFresh() {
  globalForTicket.__vendixTicketLoadedAt = Date.now();
}

function cacheValid() {
  const at = globalForTicket.__vendixTicketLoadedAt ?? 0;
  return Boolean(globalForTicket.__vendixTicketDb) && Date.now() - at < CACHE_TTL_MS;
}

function getDb(): TicketDb {
  if (!globalForTicket.__vendixTicketDb) {
    globalForTicket.__vendixTicketDb = emptyTicketDb();
  }
  return globalForTicket.__vendixTicketDb;
}

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

function normalizeTopic(raw: Partial<TicketTopic> & { id: string }): TicketTopic {
  return {
    id: raw.id,
    name: (raw.name || "주제").trim().slice(0, 40) || "주제",
    description: (raw.description || "").trim().slice(0, 100),
    emoji: raw.emoji?.trim() || null,
  };
}

function normalizeMacro(raw: Partial<TicketMacro> & { id: string }): TicketMacro {
  return {
    id: raw.id,
    label: (raw.label || "매크로").trim().slice(0, 40) || "매크로",
    body: (raw.body || "").trim().slice(0, 1900),
    shortcut: raw.shortcut?.trim()?.slice(0, 2) || null,
  };
}

function normalizeGuild(raw: Partial<TicketGuild> & { guildId: string }): TicketGuild {
  const panel = defaultTicketGuildPanel();
  const topics = Array.isArray(raw.topics) && raw.topics.length
    ? raw.topics.filter((t) => t?.id).map((t) => normalizeTopic(t as TicketTopic))
    : defaultTicketTopics();
  const macros = Array.isArray(raw.macros)
    ? raw.macros.filter((m) => m?.id).map((m) => normalizeMacro(m as TicketMacro))
    : [];
  return {
    guildId: raw.guildId,
    guildName: raw.guildName || `서버-${raw.guildId.slice(-4)}`,
    adminPasswordHash: raw.adminPasswordHash || "",
    enabled: raw.enabled !== false,
    ticketCategoryId: raw.ticketCategoryId ?? null,
    closeRoleIds: asStringList(raw.closeRoleIds),
    mentionRoleIds: asStringList(raw.mentionRoleIds),
    logChannelId: raw.logChannelId ?? null,
    panelTitle: raw.panelTitle?.trim() || panel.panelTitle,
    panelDescription: raw.panelDescription?.trim() || panel.panelDescription,
    panelColor: Number.isFinite(Number(raw.panelColor))
      ? Math.floor(Number(raw.panelColor))
      : panel.panelColor,
    panelBannerUrl: raw.panelBannerUrl?.trim() || null,
    openEmbedTitle: raw.openEmbedTitle?.trim() || panel.openEmbedTitle,
    openEmbedBody: raw.openEmbedBody?.trim() || panel.openEmbedBody,
    topics,
    blacklistUserIds: asStringList(raw.blacklistUserIds),
    macros,
    linkedShopSlug: raw.linkedShopSlug?.trim() || null,
    aiEnabled: raw.aiEnabled !== false,
    registeredBy: raw.registeredBy ?? null,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

function normalizeCsat(v: unknown): 1 | 2 | 3 | 4 | 5 | null {
  const n = Number(v);
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) return n;
  return null;
}

function normalizeCloseReason(v: unknown): TicketCloseReason | null {
  if (v === "resolved" || v === "spam" || v === "duplicate" || v === "other") return v;
  return null;
}

function normalizeTicket(raw: Partial<TicketRecord> & { id: string; guildId: string }): TicketRecord {
  return {
    id: raw.id,
    guildId: raw.guildId,
    channelId: raw.channelId || "",
    topicId: raw.topicId || "",
    topicName: raw.topicName || "",
    openerId: raw.openerId || "",
    openerName: raw.openerName || "unknown",
    openerNameSlug: raw.openerNameSlug || slugifyUsername(raw.openerName || "user"),
    status: raw.status === "closed" ? "closed" : "open",
    userTicketIndex: Math.max(1, Number(raw.userTicketIndex) || 1),
    createdAt: raw.createdAt || new Date().toISOString(),
    closedAt: raw.closedAt ?? null,
    closedBy: raw.closedBy ?? null,
    closeReason: normalizeCloseReason(raw.closeReason),
    csat: normalizeCsat(raw.csat),
    firstStaffReplyAt: raw.firstStaffReplyAt ?? null,
    aiPaused: raw.aiPaused === true,
    aiGreetedAt: raw.aiGreetedAt ?? null,
  };
}

function normalizeTranscript(
  raw: Partial<TicketTranscript> & { id: string; guildId: string; ticketId: string },
): TicketTranscript {
  return {
    id: raw.id,
    guildId: raw.guildId,
    ticketId: raw.ticketId,
    openerNameSlug: raw.openerNameSlug || "user",
    index: Math.max(1, Number(raw.index) || 1),
    topicName: raw.topicName || "",
    openerId: raw.openerId || "",
    openerName: raw.openerName || "unknown",
    closedBy: raw.closedBy ?? null,
    createdAt: raw.createdAt || new Date().toISOString(),
    closedAt: raw.closedAt || new Date().toISOString(),
    closeReason: normalizeCloseReason(raw.closeReason),
    csat: normalizeCsat(raw.csat),
    messages: Array.isArray(raw.messages) ? (raw.messages as TranscriptMessage[]) : [],
  };
}

function normalizeAudit(raw: Partial<TicketAudit> & { id: string; guildId: string }): TicketAudit {
  return {
    id: raw.id,
    guildId: raw.guildId,
    actor: raw.actor || "system",
    action: raw.action || "update",
    detail: (raw.detail || "").slice(0, 500),
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

function normalizeDb(raw: Partial<TicketDb> | null): TicketDb {
  return {
    guilds: Array.isArray(raw?.guilds)
      ? raw!.guilds!.filter((g) => g?.guildId).map((g) => normalizeGuild(g))
      : [],
    tickets: Array.isArray(raw?.tickets)
      ? raw!.tickets!.filter((t) => t?.id && t?.guildId).map((t) => normalizeTicket(t as TicketRecord))
      : [],
    transcripts: Array.isArray(raw?.transcripts)
      ? raw!.transcripts!
          .filter((t) => t?.id && t?.guildId)
          .map((t) => normalizeTranscript(t as TicketTranscript))
      : [],
    audits: Array.isArray(raw?.audits)
      ? raw!.audits!.filter((a) => a?.id && a?.guildId).map((a) => normalizeAudit(a as TicketAudit))
      : [],
  };
}

export async function initTicketStore(opts?: { force?: boolean }) {
  if (!opts?.force && cacheValid()) return getDb();
  try {
    const kv = await getKvBinding();
    if (kv) {
      const raw = await kv.get(TICKET_DB_KV_KEY);
      if (raw) {
        globalForTicket.__vendixTicketDb = normalizeDb(JSON.parse(raw) as Partial<TicketDb>);
        markFresh();
        return getDb();
      }
    }
  } catch {
    /* empty */
  }
  if (!globalForTicket.__vendixTicketDb) {
    globalForTicket.__vendixTicketDb = emptyTicketDb();
  }
  markFresh();
  return getDb();
}

function mergeTicketDb(remote: TicketDb, local: TicketDb): TicketDb {
  const guildMap = new Map<string, TicketGuild>();
  for (const g of remote.guilds) guildMap.set(g.guildId, g);
  for (const g of local.guilds) {
    const prev = guildMap.get(g.guildId);
    if (!prev) {
      guildMap.set(g.guildId, g);
      continue;
    }
    // Newer updatedAt wins for settings
    guildMap.set(
      g.guildId,
      (g.updatedAt || "") >= (prev.updatedAt || "") ? g : prev,
    );
  }

  const ticketMap = new Map<string, TicketRecord>();
  for (const t of remote.tickets) ticketMap.set(t.id, t);
  for (const t of local.tickets) {
    const prev = ticketMap.get(t.id);
    if (!prev) {
      ticketMap.set(t.id, t);
      continue;
    }
    // Prefer closed / richer state
    if (t.status === "closed" && prev.status === "open") ticketMap.set(t.id, t);
    else if (prev.status === "closed" && t.status === "open") {
      /* keep closed */
    } else ticketMap.set(t.id, t);
  }
  // Also index by channelId to avoid duplicates
  const byChannel = new Map<string, TicketRecord>();
  for (const t of ticketMap.values()) {
    const key = `${t.guildId}:${t.channelId}`;
    const prev = byChannel.get(key);
    if (!prev) byChannel.set(key, t);
    else if (t.status === "open" && prev.status !== "open") byChannel.set(key, t);
  }

  const transcriptMap = new Map<string, TicketTranscript>();
  for (const t of remote.transcripts) transcriptMap.set(t.id, t);
  for (const t of local.transcripts) transcriptMap.set(t.id, t);
  // Deduplicate by guild+slug+index
  const byKey = new Map<string, TicketTranscript>();
  for (const t of transcriptMap.values()) {
    const key = `${t.guildId}:${t.openerNameSlug}:${t.index}`;
    const prev = byKey.get(key);
    if (!prev || (t.messages?.length || 0) >= (prev.messages?.length || 0)) {
      byKey.set(key, t);
    }
  }

  return {
    guilds: [...guildMap.values()],
    tickets: [...byChannel.values()],
    transcripts: [...byKey.values()],
    audits: (() => {
      const map = new Map<string, TicketAudit>();
      for (const a of remote.audits || []) map.set(a.id, a);
      for (const a of local.audits || []) map.set(a.id, a);
      return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 500);
    })(),
  };
}

export async function persistTicketStore() {
  const local = getDb();
  try {
    const kv = await getKvBinding();
    if (kv) {
      let remote = emptyTicketDb();
      try {
        const raw = await kv.get(TICKET_DB_KV_KEY);
        if (raw) remote = normalizeDb(JSON.parse(raw) as Partial<TicketDb>);
      } catch {
        /* empty remote */
      }
      const merged = mergeTicketDb(remote, local);
      globalForTicket.__vendixTicketDb = merged;
      await kv.put(TICKET_DB_KV_KEY, JSON.stringify(merged));
    }
  } catch (err) {
    console.error("[ticket-bot] persist failed", err);
  }
  markFresh();
}

/** Force fresh KV read — use before listing for web panel */
export async function refreshTicketStore() {
  return initTicketStore({ force: true });
}

export function upsertOpenTicketFromChannel(input: {
  guildId: string;
  channelId: string;
  channelName: string;
  topicId?: string;
  topicName?: string;
  openerId?: string;
  openerName?: string;
}): TicketRecord | null {
  if (isNonTicketChannelName(input.channelName)) {
    return null;
  }

  const db = getDb();
  const existing = db.tickets.find(
    (t) => t.guildId === input.guildId && t.channelId === input.channelId,
  );
  if (existing) {
    if (existing.status !== "open") {
      existing.status = "open";
      existing.closedAt = null;
      existing.closedBy = null;
    }
    // 잘못된 복구 라벨(장식 채널명 등) 재파싱
    if (
      existing.openerId === "unknown" &&
      (/[『』｜|]/.test(existing.openerName) ||
        existing.openerName === input.channelName ||
        existing.topicName === "문의")
    ) {
      const guild = getTicketGuild(input.guildId);
      const parsed = parseRecoveredChannelName(input.channelName, guild);
      const topic =
        guild?.topics.find((t) => sanitizeLoose(input.channelName).includes(sanitizeLoose(t.name))) ||
        guild?.topics.find((t) => sanitizeLoose(t.name) === sanitizeLoose(parsed.topicName));
      if (topic) existing.topicName = topic.name;
      else if (parsed.topicName) existing.topicName = parsed.topicName;
      if (parsed.openerName && parsed.openerName !== input.channelName) {
        existing.openerName = parsed.openerName;
        existing.openerNameSlug = slugifyUsername(parsed.openerName);
      }
    }
    return existing;
  }

  const guild = getTicketGuild(input.guildId);
  const parsed = parseRecoveredChannelName(input.channelName, guild);
  const topic =
    guild?.topics.find((t) => t.id === input.topicId) ||
    guild?.topics.find((t) => t.name === input.topicName) ||
    guild?.topics.find((t) => sanitizeLoose(t.name) === sanitizeLoose(parsed.topicName)) ||
    guild?.topics.find((t) => sanitizeLoose(input.channelName).includes(sanitizeLoose(t.name)));

  const topicName = topic?.name || input.topicName || parsed.topicName;
  const openerName = input.openerName || parsed.openerName;
  const ticket: TicketRecord = {
    id: randomUUID(),
    guildId: input.guildId,
    channelId: input.channelId,
    topicId: topic?.id || input.topicId || "recovered",
    topicName,
    openerId: input.openerId || "unknown",
    openerName,
    openerNameSlug: slugifyUsername(openerName),
    status: "open",
    userTicketIndex: nextUserTicketIndex(input.guildId, input.openerId || openerName),
    createdAt: new Date().toISOString(),
    closedAt: null,
    closedBy: null,
    closeReason: null,
    csat: null,
    firstStaffReplyAt: null,
    aiPaused: !input.openerId,
    aiGreetedAt: null,
  };
  db.tickets.push(ticket);
  return ticket;
}

/** Discord 채널명에서 주제·요청자 추정 (문의-user / 『🔒』｜관리자로그 등) */
function parseRecoveredChannelName(
  channelName: string,
  guild: TicketGuild | null,
): { topicName: string; openerName: string } {
  const cleaned = channelName
    .replace(/^[『」\[\(]*\s*[🔒🔐]*\s*[』」\]\)]*\s*/u, "")
    .replace(/^[|｜·•]+\s*/u, "")
    .trim();

  if (guild?.topics?.length) {
    const hit = [...guild.topics]
      .sort((a, b) => b.name.length - a.name.length)
      .find((t) => sanitizeLoose(cleaned).includes(sanitizeLoose(t.name)));
    if (hit) {
      const loose = sanitizeLoose(cleaned);
      const tLoose = sanitizeLoose(hit.name);
      const restLoose = loose.replace(tLoose, "").replace(/^-+/, "");
      const openerName =
        restLoose.length >= 2
          ? cleaned
              .replace(new RegExp(hit.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "")
              .replace(/^[\s\-_|｜·•]+/, "")
              .trim() || hit.name
          : hit.name;
      return { topicName: hit.name, openerName: openerName || hit.name };
    }
  }

  const parts = cleaned.split(/[-_|｜·•]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { topicName: parts[0], openerName: parts.slice(1).join("-") };
  }
  return { topicName: parts[0] || "문의", openerName: cleaned || channelName || "unknown" };
}

function sanitizeLoose(s: string) {
  return s.toLowerCase().replace(/[^\w가-힣]+/g, "");
}

/** 티켓이 아닌 로그/공지성 채널명 (열린 티켓 복구 대상에서 제외) */
export function isNonTicketChannelName(channelName: string): boolean {
  const raw = (channelName || "").trim();
  if (!raw) return true;
  const cleaned = raw
    .replace(/[『』「」\[\]\(\)🔒🔐|｜·•\s_-]+/gu, "")
    .toLowerCase();
  if (!cleaned) return true;
  if (
    /로그$/.test(cleaned) ||
    /(관리자로그|시스템로그|충전로그|구매로그|입고알림|후기로그|restock)/.test(cleaned) ||
    /^(공지|notice|rules|규칙|일반|general|채팅|chat)$/.test(cleaned) ||
    /(adminlog|systemlog|chargelog|purchaselog|purchase-?log)$/.test(cleaned)
  ) {
    return true;
  }
  // 『🔒』｜관리자로그 처럼 장식만 있고 topic-user(-) 형태가 아니면 제외
  if (/[『』｜|]/.test(raw)) {
    const body = raw
      .replace(/^[『」\[\(]*\s*[🔒🔐]*\s*[』」\]\)]*\s*/u, "")
      .replace(/^[|｜·•]+\s*/u, "")
      .trim();
    if (!/[-_]/.test(body)) return true;
  }
  return false;
}

export function getTicketGuild(guildId: string): TicketGuild | null {
  return getDb().guilds.find((g) => g.guildId === guildId) ?? null;
}

export function listTicketGuilds(): TicketGuild[] {
  return getDb().guilds;
}

export function registerTicketGuild(input: {
  guildId: string;
  guildName: string;
  registeredBy: string;
}): { guild: TicketGuild; password: string; created: boolean } {
  const db = getDb();
  const password = randomBytes(6).toString("hex");
  const now = new Date().toISOString();
  const existing = db.guilds.find((g) => g.guildId === input.guildId);
  if (existing) {
    existing.adminPasswordHash = hashPassword(password);
    existing.guildName = input.guildName || existing.guildName;
    existing.registeredBy = input.registeredBy;
    existing.updatedAt = now;
    existing.enabled = true;
    return { guild: existing, password, created: false };
  }

  const guild = normalizeGuild({
    guildId: input.guildId,
    guildName: input.guildName || `서버-${input.guildId.slice(-4)}`,
    adminPasswordHash: hashPassword(password),
    registeredBy: input.registeredBy,
    createdAt: now,
    updatedAt: now,
  });
  db.guilds.push(guild);
  return { guild, password, created: true };
}

export function verifyTicketGuildLogin(guildId: string, password: string) {
  const guild = getTicketGuild(guildId);
  if (!guild?.adminPasswordHash) return false;
  return verifyPassword(password, guild.adminPasswordHash);
}

export function setTicketGuildPassword(guildId: string, newPassword: string) {
  const guild = getTicketGuild(guildId);
  if (!guild) return false;
  guild.adminPasswordHash = hashPassword(newPassword);
  guild.updatedAt = new Date().toISOString();
  return true;
}

export function updateTicketGuild(guildId: string, patch: TicketGuildPatch) {
  const guild = getTicketGuild(guildId);
  if (!guild) return null;
  if (patch.enabled !== undefined) guild.enabled = patch.enabled;
  if (patch.guildName !== undefined) guild.guildName = patch.guildName.trim() || guild.guildName;
  if (patch.ticketCategoryId !== undefined) {
    guild.ticketCategoryId = patch.ticketCategoryId?.trim() || null;
  }
  if (patch.closeRoleIds !== undefined) guild.closeRoleIds = asStringList(patch.closeRoleIds);
  if (patch.mentionRoleIds !== undefined) guild.mentionRoleIds = asStringList(patch.mentionRoleIds);
  if (patch.logChannelId !== undefined) {
    guild.logChannelId = patch.logChannelId?.trim() || null;
  }
  if (patch.panelTitle !== undefined) guild.panelTitle = patch.panelTitle.trim() || guild.panelTitle;
  if (patch.panelDescription !== undefined) {
    guild.panelDescription = patch.panelDescription.trim() || guild.panelDescription;
  }
  if (patch.panelColor !== undefined && Number.isFinite(patch.panelColor)) {
    guild.panelColor = Math.floor(patch.panelColor);
  }
  if (patch.panelBannerUrl !== undefined) {
    guild.panelBannerUrl = patch.panelBannerUrl?.trim() || null;
  }
  if (patch.openEmbedTitle !== undefined) {
    guild.openEmbedTitle = patch.openEmbedTitle.trim() || guild.openEmbedTitle;
  }
  if (patch.openEmbedBody !== undefined) {
    guild.openEmbedBody = patch.openEmbedBody.trim() || guild.openEmbedBody;
  }
  if (patch.topics !== undefined) {
    guild.topics = patch.topics.filter((t) => t?.id).map((t) => normalizeTopic(t));
    if (!guild.topics.length) guild.topics = defaultTicketTopics();
  }
  if (patch.blacklistUserIds !== undefined) {
    guild.blacklistUserIds = asStringList(patch.blacklistUserIds);
  }
  if (patch.macros !== undefined) {
    guild.macros = patch.macros.filter((m) => m?.id).map((m) => normalizeMacro(m));
  }
  if (patch.linkedShopSlug !== undefined) {
    guild.linkedShopSlug = patch.linkedShopSlug?.trim() || null;
  }
  if (patch.aiEnabled !== undefined) guild.aiEnabled = patch.aiEnabled;
  guild.updatedAt = new Date().toISOString();
  return guild;
}

export function appendTicketAudit(input: {
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

export function listTicketAudits(guildId: string, limit = 80) {
  return getDb()
    .audits.filter((a) => a.guildId === guildId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function publicTicketGuild(guild: TicketGuild) {
  return {
    guildId: guild.guildId,
    guildName: guild.guildName,
    enabled: guild.enabled,
    ticketCategoryId: guild.ticketCategoryId,
    closeRoleIds: guild.closeRoleIds,
    mentionRoleIds: guild.mentionRoleIds,
    logChannelId: guild.logChannelId,
    panelTitle: guild.panelTitle,
    panelDescription: guild.panelDescription,
    panelColor: guild.panelColor,
    panelBannerUrl: guild.panelBannerUrl,
    openEmbedTitle: guild.openEmbedTitle,
    openEmbedBody: guild.openEmbedBody,
    topics: guild.topics,
    blacklistUserIds: guild.blacklistUserIds,
    macros: guild.macros,
    linkedShopSlug: guild.linkedShopSlug,
    createdAt: guild.createdAt,
    updatedAt: guild.updatedAt,
  };
}

export function ticketGuildStats(guildId: string) {
  const tickets = listTickets(guildId);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startIso = start.toISOString();
  const todayOpened = tickets.filter((t) => t.createdAt >= startIso).length;
  const openCount = tickets.filter((t) => t.status === "open").length;
  const withReply = tickets.filter((t) => t.firstStaffReplyAt);
  let avgFirstReplyMinutes: number | null = null;
  if (withReply.length) {
    const sum = withReply.reduce((acc, t) => {
      const a = new Date(t.createdAt).getTime();
      const b = new Date(t.firstStaffReplyAt!).getTime();
      return acc + Math.max(0, b - a);
    }, 0);
    avgFirstReplyMinutes = Math.round(sum / withReply.length / 60000);
  }
  const csatValues = tickets.map((t) => t.csat).filter((v): v is 1 | 2 | 3 | 4 | 5 => v != null);
  const avgCsat =
    csatValues.length > 0
      ? Math.round((csatValues.reduce((a, b) => a + b, 0) / csatValues.length) * 10) / 10
      : null;
  return { todayOpened, openCount, avgFirstReplyMinutes, avgCsat, csatCount: csatValues.length };
}

export function listTickets(guildId: string, status?: "open" | "closed") {
  return getDb()
    .tickets.filter((t) => t.guildId === guildId && (!status || t.status === status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getTicketById(ticketId: string) {
  return getDb().tickets.find((t) => t.id === ticketId) ?? null;
}

/** Remove a bogus open ticket row (no transcript). Used to undo wrong Discord sync. */
export function removeOpenTicketRecord(ticketId: string) {
  const db = getDb();
  const idx = db.tickets.findIndex((t) => t.id === ticketId && t.status === "open");
  if (idx < 0) return false;
  db.tickets.splice(idx, 1);
  return true;
}

export function getTicketByChannel(guildId: string, channelId: string) {
  return (
    getDb().tickets.find(
      (t) => t.guildId === guildId && t.channelId === channelId && t.status === "open",
    ) ?? null
  );
}

export function findOpenTicket(guildId: string, openerId: string, topicId: string) {
  return (
    getDb().tickets.find(
      (t) =>
        t.guildId === guildId &&
        t.openerId === openerId &&
        t.topicId === topicId &&
        t.status === "open",
    ) ?? null
  );
}

export function nextUserTicketIndex(guildId: string, openerId: string) {
  const count = getDb().tickets.filter(
    (t) => t.guildId === guildId && t.openerId === openerId,
  ).length;
  return count + 1;
}

export function createTicketRecord(input: {
  guildId: string;
  channelId: string;
  topicId: string;
  topicName: string;
  openerId: string;
  openerName: string;
}): TicketRecord {
  const db = getDb();
  const openerNameSlug = slugifyUsername(input.openerName);
  const ticket: TicketRecord = {
    id: randomUUID(),
    guildId: input.guildId,
    channelId: input.channelId,
    topicId: input.topicId,
    topicName: input.topicName,
    openerId: input.openerId,
    openerName: input.openerName,
    openerNameSlug,
    status: "open",
    userTicketIndex: nextUserTicketIndex(input.guildId, input.openerId),
    createdAt: new Date().toISOString(),
    closedAt: null,
    closedBy: null,
    closeReason: null,
    csat: null,
    firstStaffReplyAt: null,
    aiPaused: false,
    aiGreetedAt: null,
  };
  db.tickets.push(ticket);
  return ticket;
}

export function markTicketStaffReply(ticketId: string) {
  const ticket = getTicketById(ticketId);
  if (!ticket || ticket.status !== "open") return false;
  if (!ticket.firstStaffReplyAt) {
    ticket.firstStaffReplyAt = new Date().toISOString();
    return true;
  }
  return false;
}

export function closeTicketRecord(
  ticketId: string,
  closedBy: string,
  messages: TranscriptMessage[],
  opts?: { closeReason?: TicketCloseReason | null; csat?: 1 | 2 | 3 | 4 | 5 | null },
): { ticket: TicketRecord; transcript: TicketTranscript } | null {
  const db = getDb();
  const ticket = db.tickets.find((t) => t.id === ticketId);
  if (!ticket || ticket.status !== "open") return null;
  const now = new Date().toISOString();
  ticket.status = "closed";
  ticket.closedAt = now;
  ticket.closedBy = closedBy;
  ticket.closeReason = opts?.closeReason ?? null;
  ticket.csat = opts?.csat ?? null;

  const transcript: TicketTranscript = {
    id: randomUUID(),
    guildId: ticket.guildId,
    ticketId: ticket.id,
    openerNameSlug: ticket.openerNameSlug,
    index: ticket.userTicketIndex,
    topicName: ticket.topicName,
    openerId: ticket.openerId,
    openerName: ticket.openerName,
    closedBy,
    createdAt: ticket.createdAt,
    closedAt: now,
    closeReason: ticket.closeReason,
    csat: ticket.csat,
    messages,
  };
  db.transcripts.push(transcript);
  return { ticket, transcript };
}

export function getTranscript(guildId: string, usernameSlug: string, index: number) {
  return (
    getDb().transcripts.find(
      (t) =>
        t.guildId === guildId &&
        t.openerNameSlug === usernameSlug &&
        t.index === index,
    ) ?? null
  );
}

export function listTranscripts(guildId: string, limit = 80) {
  return getDb()
    .transcripts.filter((t) => t.guildId === guildId)
    .sort((a, b) => b.closedAt.localeCompare(a.closedAt))
    .slice(0, limit);
}

export function canCloseTicket(
  guild: TicketGuild,
  actorId: string,
  actorRoles: string[],
  openerId: string,
) {
  if (actorId === openerId) return true;
  if (!guild.closeRoleIds.length) return true;
  return guild.closeRoleIds.some((r) => actorRoles.includes(r));
}
