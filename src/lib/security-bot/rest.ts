import { DISCORD_API } from "@/lib/discord/components";
import { SECURITY_DISCORD_COMMANDS } from "@/lib/security-bot/commands";
import { securityDiscordEnvAsync } from "@/lib/security-bot/env";
import type { SecurityGuild } from "@/lib/security-bot/types";

export async function securityBotRest(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const env = await securityDiscordEnvAsync();
  if (!env.botToken) {
    return { ok: false, status: 0, json: { error: "SECURITY_DISCORD_BOT_TOKEN missing" } };
  }
  const res = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${env.botToken}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    console.error("[security-bot-rest]", method, path, res.status, json);
  }
  return { ok: res.ok, status: res.status, json };
}

async function putCommands(path: string) {
  const env = await securityDiscordEnvAsync();
  if (!env.applicationId || !env.botToken) {
    return { ok: false as const, error: "Security bot credentials missing" };
  }
  const res = await fetch(`${DISCORD_API}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${env.botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(SECURITY_DISCORD_COMMANDS),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      ok: false as const,
      error:
        typeof json === "object" && json && "message" in json
          ? String((json as { message?: string }).message)
          : `Discord API ${res.status}`,
    };
  }
  return { ok: true as const, commands: json };
}

export async function registerSecurityGuildCommands(guildId: string) {
  const env = await securityDiscordEnvAsync();
  return putCommands(`/applications/${env.applicationId}/guilds/${guildId}/commands`);
}

export async function fetchDiscordGuild(guildId: string) {
  const res = await securityBotRest("GET", `/guilds/${guildId}`);
  if (!res.ok || !res.json || typeof res.json !== "object") {
    return null;
  }
  const g = res.json as { id?: string; name?: string };
  if (!g.id || !g.name) return null;
  return { id: g.id, name: g.name };
}

export async function listSecurityGuildRoles(guildId: string) {
  const res = await securityBotRest("GET", `/guilds/${guildId}/roles`);
  if (!res.ok || !Array.isArray(res.json)) {
    return {
      ok: false as const,
      roles: [] as { id: string; name: string; position: number; permissions: string }[],
    };
  }
  const roles = (
    res.json as { id: string; name: string; position: number; permissions?: string }[]
  )
    .filter((r) => r.name !== "@everyone")
    .map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      permissions: r.permissions || "0",
    }))
    .sort((a, b) => b.position - a.position);
  return { ok: true as const, roles };
}

export async function listSecurityGuildChannels(guildId: string) {
  const res = await securityBotRest("GET", `/guilds/${guildId}/channels`);
  if (!res.ok || !Array.isArray(res.json)) {
    return {
      ok: false as const,
      channels: [] as { id: string; name: string; type: number; parentId: string | null }[],
    };
  }
  const channels = (
    res.json as { id: string; name: string; type: number; parent_id?: string | null }[]
  )
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      parentId: c.parent_id ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return { ok: true as const, channels };
}

export async function kickMember(guildId: string, userId: string, reason: string) {
  return securityBotRest(
    "DELETE",
    `/guilds/${guildId}/members/${userId}`,
    undefined,
    { "X-Audit-Log-Reason": encodeURIComponent(reason.slice(0, 512)) },
  );
}

export async function banMember(
  guildId: string,
  userId: string,
  reason: string,
  deleteMessageDays = 0,
) {
  return securityBotRest(
    "PUT",
    `/guilds/${guildId}/bans/${userId}`,
    {
      delete_message_seconds: Math.min(7, Math.max(0, deleteMessageDays)) * 86400,
    },
    { "X-Audit-Log-Reason": encodeURIComponent(reason.slice(0, 512)) },
  );
}

export async function unbanMember(guildId: string, userId: string, reason: string) {
  return securityBotRest(
    "DELETE",
    `/guilds/${guildId}/bans/${userId}`,
    undefined,
    { "X-Audit-Log-Reason": encodeURIComponent(reason.slice(0, 512)) },
  );
}

export async function timeoutMember(
  guildId: string,
  userId: string,
  minutes: number,
  reason: string,
) {
  const until = new Date(Date.now() + minutes * 60_000).toISOString();
  return securityBotRest(
    "PATCH",
    `/guilds/${guildId}/members/${userId}`,
    { communication_disabled_until: until },
    { "X-Audit-Log-Reason": encodeURIComponent(reason.slice(0, 512)) },
  );
}

export async function clearTimeoutMember(guildId: string, userId: string, reason: string) {
  return securityBotRest(
    "PATCH",
    `/guilds/${guildId}/members/${userId}`,
    { communication_disabled_until: null },
    { "X-Audit-Log-Reason": encodeURIComponent(reason.slice(0, 512)) },
  );
}

export async function bulkDeleteMessages(channelId: string, messageIds: string[]) {
  if (messageIds.length === 1) {
    return securityBotRest("DELETE", `/channels/${channelId}/messages/${messageIds[0]}`);
  }
  return securityBotRest("POST", `/channels/${channelId}/messages/bulk-delete`, {
    messages: messageIds.slice(0, 100),
  });
}

export async function fetchRecentMessages(channelId: string, limit = 100) {
  const res = await securityBotRest(
    "GET",
    `/channels/${channelId}/messages?limit=${Math.min(100, Math.max(1, limit))}`,
  );
  if (!res.ok || !Array.isArray(res.json)) return [] as { id: string; author?: { id: string } }[];
  return res.json as { id: string; author?: { id: string } }[];
}

/** Deny @everyone SEND_MESSAGES in all text channels (lockdown) */
export async function setGuildLockdown(guildId: string, locked: boolean) {
  const res = await securityBotRest("GET", `/guilds/${guildId}/channels`);
  if (!res.ok || !Array.isArray(res.json)) return { ok: false as const, error: "채널 목록 실패" };
  const channels = res.json as {
    id: string;
    type: number;
    permission_overwrites?: { id: string; type: number; allow: string; deny: string }[];
  }[];

  const SEND = BigInt(1) << BigInt(11);
  let changed = 0;
  for (const ch of channels) {
    if (ch.type !== 0 && ch.type !== 5) continue; // text / announcement
    // @everyone 의 다른 권한(비공개 채널의 보기 금지 등)은 그대로 두고 메시지 보내기만 바꾼다
    const current = ch.permission_overwrites?.find((o) => o.id === guildId);
    const deny = BigInt(current?.deny ?? "0");
    const allow = BigInt(current?.allow ?? "0");
    const nextDeny = locked ? deny | SEND : deny & ~SEND;
    const nextAllow = locked ? allow & ~SEND : allow;
    if (nextDeny === deny && nextAllow === allow) continue;

    const put = await securityBotRest("PUT", `/channels/${ch.id}/permissions/${guildId}`, {
      type: 0,
      deny: String(nextDeny),
      allow: String(nextAllow),
    });
    if (put.ok) changed += 1;
  }
  return { ok: true as const, changed };
}

export async function postSecurityLog(channelId: string, content: string) {
  return securityBotRest("POST", `/channels/${channelId}/messages`, {
    content: content.slice(0, 2000),
  });
}

/** Sync Discord AutoMod rules from guild settings */
export async function syncSecurityAutoMod(guild: SecurityGuild) {
  const listed = await securityBotRest("GET", `/guilds/${guild.guildId}/auto-moderation/rules`);
  const existing = Array.isArray(listed.json)
    ? (listed.json as { id: string; name: string }[])
    : [];

  // Remove previous DOES-managed rules
  for (const rule of existing) {
    if (rule.name.startsWith("DOES-SEC:") || rule.name.startsWith("VENDIX-SEC:")) {
      await securityBotRest(
        "DELETE",
        `/guilds/${guild.guildId}/auto-moderation/rules/${rule.id}`,
      );
    }
  }

  const created: string[] = [];

  if (guild.blockEveryoneHere) {
    const res = await securityBotRest("POST", `/guilds/${guild.guildId}/auto-moderation/rules`, {
      name: "DOES-SEC: everyone/here",
      event_type: 1, // MESSAGE_SEND
      trigger_type: 1, // KEYWORD
      trigger_metadata: {
        keyword_filter: ["@everyone", "@here"],
      },
      actions: [
        { type: 1 }, // block message
        ...(guild.logChannelId
          ? [{ type: 2, metadata: { channel_id: guild.logChannelId } }]
          : []),
      ],
      enabled: true,
    });
    if (res.ok) created.push("everyone/here");
  }

  if (guild.mentionSpamLimit > 0) {
    const actions: unknown[] = [];
    if (guild.mentionSpamAction === "timeout") {
      actions.push({ type: 3, metadata: { duration_seconds: 600 } });
    } else {
      actions.push({ type: 1 });
    }
    if (guild.logChannelId) {
      actions.push({ type: 2, metadata: { channel_id: guild.logChannelId } });
    }
    const res = await securityBotRest("POST", `/guilds/${guild.guildId}/auto-moderation/rules`, {
      name: "DOES-SEC: mention spam",
      event_type: 1,
      trigger_type: 4, // MENTION_SPAM
      trigger_metadata: {
        mention_total_limit: guild.mentionSpamLimit,
      },
      actions,
      enabled: true,
    });
    if (res.ok) created.push("mention-spam");
  }

  if (guild.antiInviteSpam) {
    const res = await securityBotRest("POST", `/guilds/${guild.guildId}/auto-moderation/rules`, {
      name: "DOES-SEC: invite spam",
      event_type: 1,
      trigger_type: 1,
      trigger_metadata: {
        keyword_filter: ["discord.gg/", "discord.com/invite/"],
        regex_patterns: ["discord\\.gg\\/\\w+", "discord(?:app)?\\.com\\/invite\\/\\w+"],
      },
      actions: [{ type: 1 }],
      enabled: true,
    });
    if (res.ok) created.push("invite");
  }

  if (guild.antiLinkSpam) {
    const res = await securityBotRest("POST", `/guilds/${guild.guildId}/auto-moderation/rules`, {
      name: "DOES-SEC: link spam",
      event_type: 1,
      trigger_type: 1,
      trigger_metadata: {
        regex_patterns: ["https?:\\/\\/[^\\s]+"],
      },
      actions: [{ type: 1 }],
      enabled: true,
    });
    if (res.ok) created.push("links");
  }

  if (guild.antiScamKeywords) {
    const res = await securityBotRest("POST", `/guilds/${guild.guildId}/auto-moderation/rules`, {
      name: "DOES-SEC: scam keywords",
      event_type: 1,
      trigger_type: 1,
      trigger_metadata: {
        keyword_filter: [
          "steamcommunity.com/gift",
          "free nitro",
          "discord nitro free",
          "@everyone free",
          "airdrop",
          "claim your nitro",
        ],
      },
      actions: [
        { type: 1 },
        { type: 3, metadata: { duration_seconds: 600 } },
      ],
      enabled: true,
    });
    if (res.ok) created.push("scam");
  }

  return { ok: true as const, created };
}

export async function setChannelSlowmode(channelId: string, seconds: number) {
  return securityBotRest("PATCH", `/channels/${channelId}`, {
    rate_limit_per_user: Math.min(21600, Math.max(0, seconds)),
  });
}

export async function applyGuildSlowmode(guildId: string, seconds: number) {
  const listed = await listSecurityGuildChannels(guildId);
  if (!listed.ok) return { ok: false as const, changed: 0 };
  let changed = 0;
  for (const ch of listed.channels) {
    if (ch.type !== 0 && ch.type !== 5) continue;
    const res = await setChannelSlowmode(ch.id, seconds);
    if (res.ok) changed += 1;
  }
  return { ok: true as const, changed };
}

export async function resetMemberNick(guildId: string, userId: string, reason: string) {
  return securityBotRest(
    "PATCH",
    `/guilds/${guildId}/members/${userId}`,
    { nick: null },
    { "X-Audit-Log-Reason": encodeURIComponent(reason.slice(0, 512)) },
  );
}

export async function addMemberRole(
  guildId: string,
  userId: string,
  roleId: string,
  reason: string,
) {
  return securityBotRest(
    "PUT",
    `/guilds/${guildId}/members/${userId}/roles/${roleId}`,
    undefined,
    { "X-Audit-Log-Reason": encodeURIComponent(reason.slice(0, 512)) },
  );
}

export async function fetchGuildMember(guildId: string, userId: string) {
  const res = await securityBotRest("GET", `/guilds/${guildId}/members/${userId}`);
  if (!res.ok || !res.json || typeof res.json !== "object") return null;
  return res.json as {
    user?: { id: string; username?: string; global_name?: string | null; avatar?: string | null };
    nick?: string | null;
    roles?: string[];
    joined_at?: string;
    communication_disabled_until?: string | null;
  };
}

export async function deleteMessage(channelId: string, messageId: string) {
  return securityBotRest("DELETE", `/channels/${channelId}/messages/${messageId}`);
}

export async function removeMemberRole(
  guildId: string,
  userId: string,
  roleId: string,
  reason: string,
) {
  return securityBotRest(
    "DELETE",
    `/guilds/${guildId}/members/${userId}/roles/${roleId}`,
    undefined,
    { "X-Audit-Log-Reason": encodeURIComponent(reason.slice(0, 512)) },
  );
}

/** Discord audit log entry */
export type AuditLogEntry = {
  id: string;
  action_type: number;
  user_id?: string;
  target_id?: string;
  reason?: string;
};

export async function fetchRecentAuditLog(
  guildId: string,
  actionType?: number,
  limit = 6,
): Promise<AuditLogEntry[]> {
  const q = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, limit))) });
  if (actionType !== undefined) q.set("action_type", String(actionType));
  const res = await securityBotRest("GET", `/guilds/${guildId}/audit-logs?${q}`);
  if (!res.ok || !res.json || typeof res.json !== "object") return [];
  const entries = (res.json as { audit_log_entries?: AuditLogEntry[] }).audit_log_entries;
  return Array.isArray(entries) ? entries : [];
}

/** Resolve executor for a recent action (CHANNEL_DELETE=12, MEMBER_BAN_ADD=22, MEMBER_ROLE_UPDATE=25) */
export async function resolveAuditActor(
  guildId: string,
  actionType: number,
  targetId?: string,
): Promise<{ actorId: string; reason?: string } | null> {
  const entries = await fetchRecentAuditLog(guildId, actionType, 8);
  const now = Date.now();
  for (const e of entries) {
    // snowflake of audit entry ≈ time
    try {
      const created = Number((BigInt(e.id) >> BigInt(22)) + BigInt(1_420_070_400_000));
      if (now - created > 15_000) continue;
    } catch {
      /* ignore */
    }
    if (targetId && e.target_id && e.target_id !== targetId) continue;
    if (!e.user_id) continue;
    return { actorId: e.user_id, reason: e.reason };
  }
  return null;
}

const ADMIN_BIT = BigInt(1) << BigInt(3);
const MANAGE_ROLES_BIT = BigInt(1) << BigInt(28);

export function roleHasDangerousPerms(permissions: string) {
  try {
    const p = BigInt(permissions);
    return (p & ADMIN_BIT) === ADMIN_BIT || (p & MANAGE_ROLES_BIT) === MANAGE_ROLES_BIT;
  } catch {
    return false;
  }
}

export async function stripDangerousRolesFromMember(
  guildId: string,
  userId: string,
  memberRoleIds: string[],
  trustedRoleIds: string[],
  reason: string,
) {
  const listed = await listSecurityGuildRoles(guildId);
  if (!listed.ok) return { stripped: [] as string[] };
  const trusted = new Set(trustedRoleIds);
  const stripped: string[] = [];
  for (const role of listed.roles) {
    if (!memberRoleIds.includes(role.id)) continue;
    if (trusted.has(role.id)) continue;
    if (!roleHasDangerousPerms(role.permissions)) continue;
    const res = await removeMemberRole(guildId, userId, role.id, reason);
    if (res.ok) stripped.push(role.name);
  }
  return { stripped };
}

export async function createGuildSnapshotData(guildId: string) {
  const [ch, roles] = await Promise.all([
    listSecurityGuildChannels(guildId),
    listSecurityGuildRoles(guildId),
  ]);
  return {
    channels: ch.channels.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      parentId: c.parentId,
    })),
    roles: roles.roles.map((r) => ({
      id: r.id,
      name: r.name,
      permissions: r.permissions,
      position: r.position,
    })),
  };
}
