import { DISCORD_API } from "@/lib/discord/components";
import { verifyDiscordEnvAsync } from "@/lib/verify-bot/env";
import { VERIFY_DISCORD_COMMANDS } from "@/lib/verify-bot/commands";

export async function verifyBotRest(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const env = await verifyDiscordEnvAsync();
  if (!env.botToken) {
    return { ok: false, status: 0, json: { error: "VERIFY_DISCORD_BOT_TOKEN missing" } };
  }
  const res = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${env.botToken}`,
      "Content-Type": "application/json",
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
    console.error("[verify-bot-rest]", method, path, res.status, json);
  }
  return { ok: res.ok, status: res.status, json };
}

async function putVerifyCommands(path: string, commands: readonly unknown[] = VERIFY_DISCORD_COMMANDS) {
  const env = await verifyDiscordEnvAsync();
  if (!env.applicationId || !env.botToken) {
    return { ok: false as const, error: "Verify bot credentials missing" };
  }
  const res = await fetch(`${DISCORD_API}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${env.botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
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

export async function registerVerifyGlobalCommands() {
  const env = await verifyDiscordEnvAsync();
  return putVerifyCommands(`/applications/${env.applicationId}/commands`);
}

export async function registerVerifyGuildCommands(guildId: string) {
  const env = await verifyDiscordEnvAsync();
  let commands: unknown[] = [...VERIFY_DISCORD_COMMANDS];
  try {
    const { findShopByDiscordGuildId, MFA_DISCORD_GUILD_ID, MFA_SHOP_SLUG } = await import("@/lib/store");
    const { VENDIX_DISCORD_COMMANDS } = await import("@/lib/discord/commands-list");
    const shop = findShopByDiscordGuildId(guildId);
    if (guildId === MFA_DISCORD_GUILD_ID || shop?.slug === MFA_SHOP_SLUG) {
      const { doesCommandSet } = await import("@/lib/discord/sync-mfa-does");
      commands = doesCommandSet();
    } else if (shop) {
      const { DOES_COMMUNITY_COMMANDS } = await import("@/lib/discord/does-community-commands");
      commands = [...VENDIX_DISCORD_COMMANDS, ...VERIFY_DISCORD_COMMANDS, ...DOES_COMMUNITY_COMMANDS];
    }
  } catch {
    /* store not ready */
  }
  return putVerifyCommands(`/applications/${env.applicationId}/guilds/${guildId}/commands`, commands);
}

export async function addMemberRole(guildId: string, userId: string, roleId: string) {
  return verifyBotRest("PUT", `/guilds/${guildId}/members/${userId}/roles/${roleId}`, {});
}

/** Add user to guild via OAuth guilds.join access token (roles assigned separately). */
export async function addGuildMemberWithOAuth(
  guildId: string,
  userId: string,
  accessToken: string,
  roleIds?: string[],
) {
  // Discord often 403s the whole join if roles are included but bot can't manage them.
  // Join first with access_token only, then assign roles.
  const join = await verifyBotRest("PUT", `/guilds/${guildId}/members/${userId}`, {
    access_token: accessToken,
  });

  const joined = join.ok || join.status === 201 || join.status === 204;
  if (!joined) {
    return {
      ...join,
      joined: false as const,
      roleOk: false as const,
    };
  }

  let roleOk = true;
  if (roleIds?.length) {
    for (const roleId of roleIds) {
      const roleRes = await addMemberRole(guildId, userId, roleId);
      if (!roleRes.ok) {
        roleOk = false;
        console.error("[verify-bot] role after join failed", roleRes.status, roleRes.json);
      }
    }
  }

  return {
    ok: true as const,
    status: join.status || 201,
    json: join.json,
    joined: true as const,
    alreadyMember: join.status === 204,
    roleOk,
  };
}

export function formatJoinError(json: unknown, status: number) {
  if (typeof json === "object" && json && "message" in json) {
    return String((json as { message?: string }).message);
  }
  if (status === 403) {
    return "봇에 '초대 만들기(CREATE_INSTANT_INVITE)' 권한이 없거나, 같은 앱의 봇 토큰이 아니에요.";
  }
  if (status === 401) {
    return "봇 토큰이 유효하지 않아요.";
  }
  return `HTTP ${status}`;
}

export async function postVerifyLogChannel(
  channelId: string,
  payload: { flags?: number; components?: unknown[]; content?: string },
) {
  return verifyBotRest("POST", `/channels/${channelId}/messages`, payload);
}

export async function editInteractionOriginal(
  applicationId: string,
  interactionToken: string,
  payload: { content?: string; flags?: number; components?: unknown[] },
) {
  const res = await fetch(
    `${DISCORD_API}/webhooks/${applicationId}/${interactionToken}/messages/@original`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

export async function listGuildRoles(guildId: string) {
  const res = await verifyBotRest("GET", `/guilds/${guildId}/roles`);
  if (!res.ok || !Array.isArray(res.json)) {
    return { ok: false as const, roles: [] as { id: string; name: string; position: number; managed: boolean }[] };
  }
  const roles = (res.json as { id: string; name: string; position: number; managed?: boolean }[])
    .filter((r) => r.name !== "@everyone")
    .map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      managed: Boolean(r.managed),
    }))
    .sort((a, b) => b.position - a.position);
  return { ok: true as const, roles };
}

export async function listGuildTextChannels(guildId: string) {
  const res = await verifyBotRest("GET", `/guilds/${guildId}/channels`);
  if (!res.ok || !Array.isArray(res.json)) {
    return { ok: false as const, channels: [] as { id: string; name: string; type: number }[] };
  }
  const channels = (res.json as { id: string; name: string; type: number }[])
    .filter((c) => c.type === 0 || c.type === 5)
    .map((c) => ({ id: c.id, name: c.name, type: c.type }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return { ok: true as const, channels };
}

export async function kickGuildMember(guildId: string, userId: string, reason?: string) {
  const env = await verifyDiscordEnvAsync();
  if (!env.botToken) {
    return { ok: false, status: 0, json: { error: "no token" } };
  }
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${userId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bot ${env.botToken}`,
      "X-Audit-Log-Reason": encodeURIComponent(reason || "unverified timeout").slice(0, 512),
    },
  });
  return { ok: res.ok || res.status === 204, status: res.status, json: null };
}

export async function listGuildMembersPage(guildId: string, limit = 200) {
  const res = await verifyBotRest("GET", `/guilds/${guildId}/members?limit=${Math.min(1000, limit)}`);
  if (!res.ok || !Array.isArray(res.json)) {
    return {
      ok: false as const,
      members: [] as {
        user?: { id: string; username?: string; bot?: boolean };
        roles?: string[];
        joined_at?: string;
      }[],
    };
  }
  return {
    ok: true as const,
    members: res.json as {
      user?: { id: string; username?: string; bot?: boolean };
      roles?: string[];
      joined_at?: string;
    }[],
  };
}

export async function fetchGuildApproxCounts(guildId: string) {
  const res = await verifyBotRest("GET", `/guilds/${guildId}?with_counts=true`);
  if (!res.ok || !res.json || typeof res.json !== "object") {
    return { ok: false as const, memberCount: null as number | null };
  }
  const j = res.json as { approximate_member_count?: number };
  return {
    ok: true as const,
    memberCount:
      typeof j.approximate_member_count === "number" ? j.approximate_member_count : null,
  };
}

export async function sendVerifyDm(userId: string, content: string) {
  const channel = await verifyBotRest("POST", "/users/@me/channels", { recipient_id: userId });
  if (!channel.ok || !channel.json || typeof channel.json !== "object") {
    return channel;
  }
  const id = (channel.json as { id?: string }).id;
  if (!id) return { ok: false, status: 0, json: { error: "no dm channel" } };
  return verifyBotRest("POST", `/channels/${id}/messages`, { content });
}

export async function postVerifyWebhook(
  webhookUrl: string,
  content: string,
) {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 1900) }),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

