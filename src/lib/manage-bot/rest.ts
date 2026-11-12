import { DISCORD_API } from "@/lib/discord/components";
import { MANAGE_DISCORD_COMMANDS } from "@/lib/manage-bot/commands";
import { manageDiscordEnvAsync } from "@/lib/manage-bot/env";

export async function manageBotRest(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const env = await manageDiscordEnvAsync();
  if (!env.botToken) {
    return { ok: false, status: 0, json: { error: "MANAGE_DISCORD_BOT_TOKEN missing" } };
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
    console.error("[manage-bot-rest]", method, path, res.status, json);
  }
  return { ok: res.ok, status: res.status, json };
}

async function putManageCommands(path: string, commands: unknown = MANAGE_DISCORD_COMMANDS) {
  const env = await manageDiscordEnvAsync();
  if (!env.applicationId || !env.botToken) {
    return { ok: false as const, error: "Manage bot credentials missing" };
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

export async function registerManageGlobalCommands() {
  const env = await manageDiscordEnvAsync();
  return putManageCommands(`/applications/${env.applicationId}/commands`);
}

/** Clear global commands so they don't duplicate guild commands. */
export async function clearManageGlobalCommands() {
  const env = await manageDiscordEnvAsync();
  return putManageCommands(`/applications/${env.applicationId}/commands`, []);
}

export async function registerManageGuildCommands(guildId: string) {
  const env = await manageDiscordEnvAsync();
  return putManageCommands(`/applications/${env.applicationId}/guilds/${guildId}/commands`);
}

export async function listManageGuildChannels(guildId: string) {
  const res = await manageBotRest("GET", `/guilds/${guildId}/channels`);
  if (!res.ok || !Array.isArray(res.json)) {
    return { ok: false as const, channels: [] as Array<{ id: string; name: string; type: number; parentId: string | null }> };
  }
  const channels = (res.json as Array<Record<string, unknown>>).map((c) => ({
    id: String(c.id || ""),
    name: String(c.name || ""),
    type: Number(c.type) || 0,
    parentId: c.parent_id ? String(c.parent_id) : null,
  }));
  return { ok: true as const, channels };
}

export async function listManageGuildTextChannels(guildId: string) {
  const listed = await listManageGuildChannels(guildId);
  return {
    ok: listed.ok,
    channels: listed.channels.filter((c) => c.type === 0 || c.type === 5),
  };
}

export async function listManageGuildCategories(guildId: string) {
  const listed = await listManageGuildChannels(guildId);
  return {
    ok: listed.ok,
    categories: listed.channels.filter((c) => c.type === 4),
  };
}

/**
 * Ticket-bot style channel access.
 * VIEW | SEND | ADD_REACTIONS | EMBED_LINKS | ATTACH_FILES | READ_HISTORY
 */
const BANNER_MEMBER_ALLOW = String(
  BigInt(0x400) |
    BigInt(0x800) |
    BigInt(0x40) |
    BigInt(0x4000) |
    BigInt(0x8000) |
    BigInt(0x10000),
);

const BANNER_MEMBER_ALLOW_MIN = String(BigInt(0x400) | BigInt(0x800) | BigInt(0x10000));

/** VIEW + MANAGE_CHANNELS — enough to create children. Extra bits often 403. */
const CATEGORY_BOT_ALLOW = String(BigInt(0x10) | BigInt(0x400));

async function getManageBotUserId() {
  const res = await manageBotRest("GET", "/users/@me");
  if (!res.ok || !res.json || typeof res.json !== "object") return null;
  const id = String((res.json as { id?: string }).id || "");
  return id || null;
}

async function putMemberOverwrite(channelId: string, userId: string, allow: string) {
  return manageBotRest("PUT", `/channels/${channelId}/permissions/${userId}`, {
    type: 1,
    allow,
    deny: "0",
  });
}

function discordApiMessage(json: unknown, status: number) {
  if (json && typeof json === "object" && "message" in json) {
    const msg = String((json as { message?: string }).message || "");
    if (/missing permissions/i.test(msg)) {
      return (
        "Missing Permissions — 관리봇을 **다시 초대**해 **채널 관리·역할 관리**를 켜고, " +
        "배너 카테고리에서 봇 역할이 보이지 않게 막혀 있지 않은지 확인해 주세요. " +
        "(역할 목록에서 관리봇을 위로 올려 주세요)"
      );
    }
    return msg || `Discord API ${status}`;
  }
  return `Discord API ${status}`;
}

function bannerOverwrites(guildId: string, ownerId: string, botId: string | null) {
  const list: Array<{ id: string; type: number; allow: string; deny: string }> = [
    // @everyone: deny view+send (same idea as ticket bot)
    {
      id: guildId,
      type: 0,
      allow: "0",
      deny: String(BigInt(0x400) | BigInt(0x800)),
    },
    {
      id: ownerId,
      type: 1,
      allow: BANNER_MEMBER_ALLOW,
      deny: "0",
    },
  ];
  if (botId && botId !== ownerId) {
    list.push({
      id: botId,
      type: 1,
      allow: BANNER_MEMBER_ALLOW,
      deny: "0",
    });
  }
  return list;
}

async function grantOwnerAndBot(channelId: string, ownerId: string, botId: string | null) {
  let ownerPut = await putMemberOverwrite(channelId, ownerId, BANNER_MEMBER_ALLOW);
  if (!ownerPut.ok) {
    ownerPut = await putMemberOverwrite(channelId, ownerId, BANNER_MEMBER_ALLOW_MIN);
  }
  if (botId && botId !== ownerId) {
    const botPut = await putMemberOverwrite(channelId, botId, BANNER_MEMBER_ALLOW);
    if (!botPut.ok) {
      await putMemberOverwrite(channelId, botId, BANNER_MEMBER_ALLOW_MIN);
    }
  }
  return ownerPut;
}

function snowflakeId(json: unknown, key: string) {
  if (!json || typeof json !== "object") return "";
  const raw = (json as Record<string, unknown>)[key];
  return raw == null ? "" : String(raw);
}

async function moveIntoCategory(channelId: string, parentId: string) {
  const moved = await manageBotRest("PATCH", `/channels/${channelId}`, {
    parent_id: parentId,
    lock_permissions: true,
  });
  if (moved.ok) return moved;
  return manageBotRest("PATCH", `/channels/${channelId}`, {
    parent_id: parentId,
  });
}

const CATEGORY_PLACE_ERROR =
  "배너 카테고리에 채널을 넣을 수 없어요. 해당 카테고리에서 관리봇에게 **채널 보기 · 채널 관리**를 켜 주세요.";

export async function createBannerChannel(input: {
  guildId: string;
  name: string;
  parentId: string;
  ownerDiscordId: string;
  topic?: string;
}) {
  const parentId = input.parentId.trim();
  const botId = await getManageBotUserId();
  const name = input.name.slice(0, 100);
  const topic = (input.topic || "").slice(0, 1024);

  const parent = await manageBotRest("GET", `/channels/${parentId}`);
  if (!parent.ok || !parent.json || typeof parent.json !== "object") {
    return {
      ok: false,
      status: parent.status || 404,
      json: {
        message: "배너 카테고리를 찾을 수 없어요. 웹패널에서 카테고리를 다시 저장해 주세요.",
      },
    };
  }
  const parentType = Number((parent.json as { type?: number }).type);
  if (parentType !== 4) {
    return {
      ok: false,
      status: 400,
      json: {
        message:
          "선택한 배너 카테고리가 폴더(카테고리)가 아니에요. 웹패널에서 카테고리를 다시 골라 주세요.",
      },
    };
  }

  if (botId) {
    const unlocked = await putMemberOverwrite(parentId, botId, CATEGORY_BOT_ALLOW);
    if (!unlocked.ok) {
      console.error("[manage-bot] category unlock failed", unlocked.status, unlocked.json);
    }
  }

  const overwrites = bannerOverwrites(input.guildId, input.ownerDiscordId, botId);
  const bodies: Record<string, unknown>[] = [
    // Nested + synced with category — most reliable placement
    { name, type: 0, parent_id: parentId, topic },
    { name, type: 0, parent_id: parentId, topic, permission_overwrites: overwrites },
    { name, type: 0, topic },
    { name, type: 0, topic, permission_overwrites: overwrites },
  ];

  let created: { ok: boolean; status: number; json: unknown } | null = null;
  for (const body of bodies) {
    const res = await manageBotRest("POST", `/guilds/${input.guildId}/channels`, body);
    if (!res.ok) {
      console.error("[manage-bot] create failed", res.status, res.json, body.parent_id ? "nested" : "root");
      created = res;
      continue;
    }
    created = res;
    break;
  }

  if (!created?.ok) {
    return {
      ok: false,
      status: created?.status || 403,
      json: { message: discordApiMessage(created?.json, created?.status || 403) },
    };
  }

  let channelId = snowflakeId(created.json, "id");
  if (!channelId) {
    return { ok: false, status: 500, json: { message: "채널 ID를 받지 못했어요." } };
  }

  if (snowflakeId(created.json, "parent_id") !== parentId) {
    const moved = await moveIntoCategory(channelId, parentId);
    if (moved.ok && moved.json && typeof moved.json === "object") {
      created = moved;
      channelId = snowflakeId(moved.json, "id") || channelId;
    }
  }

  if (snowflakeId(created.json, "parent_id") !== parentId) {
    const check = await manageBotRest("GET", `/channels/${channelId}`);
    if (snowflakeId(check.json, "parent_id") !== parentId) {
      await deleteManageChannel(channelId, "banner category placement failed");
      return {
        ok: false,
        status: 403,
        json: { message: CATEGORY_PLACE_ERROR },
      };
    }
    created = check;
  }

  await grantOwnerAndBot(channelId, input.ownerDiscordId, botId);
  return created;
}

export async function renameManageChannel(channelId: string, name: string, topic?: string) {
  const body: Record<string, string> = { name: name.slice(0, 100) };
  if (topic != null) body.topic = topic.slice(0, 1024);
  return manageBotRest("PATCH", `/channels/${channelId}`, body);
}

export async function deleteManageChannel(channelId: string, reason?: string) {
  const env = await manageDiscordEnvAsync();
  if (!env.botToken) return { ok: false, status: 0 };
  const res = await fetch(`${DISCORD_API}/channels/${channelId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bot ${env.botToken}`,
      ...(reason
        ? { "X-Audit-Log-Reason": encodeURIComponent(reason).slice(0, 512) }
        : {}),
    },
  });
  return { ok: res.ok || res.status === 204, status: res.status };
}

export async function postManageChannelMessage(
  channelId: string,
  payload: {
    content?: string;
    flags?: number;
    components?: unknown[];
    embeds?: unknown[];
    allowed_mentions?: { parse?: string[]; users?: string[]; roles?: string[] };
  },
) {
  return manageBotRest("POST", `/channels/${channelId}/messages`, payload);
}

export async function executeDiscordWebhook(
  url: string,
  payload: {
    content?: string;
    username?: string;
    avatar_url?: string | null;
    flags?: number;
    components?: unknown[];
  },
) {
  const body: Record<string, unknown> = {};
  if (payload.flags != null) body.flags = payload.flags;
  if (payload.components?.length) body.components = payload.components;
  if (payload.content) body.content = payload.content.slice(0, 2000);
  if (payload.username) body.username = payload.username.slice(0, 80);
  if (payload.avatar_url) body.avatar_url = payload.avatar_url;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false as const, status: res.status, error: text.slice(0, 200) || `HTTP ${res.status}` };
  }
  return { ok: true as const, status: res.status };
}
