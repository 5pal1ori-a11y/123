import { DISCORD_API } from "@/lib/discord/components";
import { TICKET_DISCORD_COMMANDS } from "@/lib/ticket-bot/commands";
import { ticketDiscordEnvAsync } from "@/lib/ticket-bot/env";
import type { TranscriptMessage } from "@/lib/ticket-bot/types";
import { AsyncLocalStorage } from "node:async_hooks";

/** DOES 봇처럼 다른 봇이 같은 티켓 기능을 쓸 때, 그 봇의 토큰으로 Discord 를 부른다 */
const tokenScope = new AsyncLocalStorage<string>();

export function withTicketBotToken<T>(token: string, fn: () => Promise<T>) {
  return tokenScope.run(token, fn);
}

async function ticketBotToken() {
  return tokenScope.getStore() || (await ticketDiscordEnvAsync()).botToken;
}

export async function ticketBotRest(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const botToken = await ticketBotToken();
  if (!botToken) {
    return { ok: false, status: 0, json: { error: "TICKET_DISCORD_BOT_TOKEN missing" } };
  }
  const res = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${botToken}`,
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
    console.error("[ticket-bot-rest]", method, path, res.status, json);
  }
  return { ok: res.ok, status: res.status, json };
}

async function putTicketCommands(path: string) {
  const env = await ticketDiscordEnvAsync();
  if (!env.applicationId || !env.botToken) {
    return { ok: false as const, error: "Ticket bot credentials missing" };
  }
  const res = await fetch(`${DISCORD_API}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${env.botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(TICKET_DISCORD_COMMANDS),
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

export async function registerTicketGuildCommands(guildId: string) {
  const env = await ticketDiscordEnvAsync();
  return putTicketCommands(`/applications/${env.applicationId}/guilds/${guildId}/commands`);
}

export async function listTicketGuildRoles(guildId: string) {
  const res = await ticketBotRest("GET", `/guilds/${guildId}/roles`);
  if (!res.ok || !Array.isArray(res.json)) {
    return { ok: false as const, roles: [] as { id: string; name: string; position: number }[] };
  }
  const roles = (res.json as { id: string; name: string; position: number; managed?: boolean }[])
    .filter((r) => r.name !== "@everyone")
    .map((r) => ({ id: r.id, name: r.name, position: r.position }))
    .sort((a, b) => b.position - a.position);
  return { ok: true as const, roles };
}

export async function listTicketGuildChannels(guildId: string) {
  const res = await ticketBotRest("GET", `/guilds/${guildId}/channels`);
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

type Overwrite = {
  id: string;
  type: 0 | 1;
  allow: string;
  deny: string;
};

export async function createTicketChannel(input: {
  guildId: string;
  name: string;
  parentId: string | null;
  topic: string;
  overwrites: Overwrite[];
}) {
  return ticketBotRest("POST", `/guilds/${input.guildId}/channels`, {
    name: input.name.slice(0, 100),
    type: 0,
    topic: input.topic.slice(0, 1024),
    parent_id: input.parentId,
    permission_overwrites: input.overwrites,
  });
}

export async function deleteTicketChannel(channelId: string, reason?: string) {
  const botToken = await ticketBotToken();
  if (!botToken) return { ok: false, status: 0, json: null };
  const res = await fetch(`${DISCORD_API}/channels/${channelId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bot ${botToken}`,
      ...(reason
        ? { "X-Audit-Log-Reason": encodeURIComponent(reason).slice(0, 512) }
        : {}),
    },
  });
  return { ok: res.ok || res.status === 204, status: res.status, json: null };
}

export async function postTicketChannelMessage(
  channelId: string,
  payload: {
    content?: string;
    flags?: number;
    components?: unknown[];
    embeds?: unknown[];
    message_reference?: { message_id: string; fail_if_not_exists?: boolean };
    allowed_mentions?: { parse: string[] };
  },
) {
  return ticketBotRest("POST", `/channels/${channelId}/messages`, payload);
}

/** Pull readable text from Components V2 / embeds when `content` is empty */
function extractMessageBody(m: {
  content?: string;
  embeds?: { title?: string; description?: string; fields?: { name?: string; value?: string }[] }[];
  components?: unknown[];
  sticker_items?: { name?: string }[];
}): string {
  const direct = (m.content || "").trim();
  if (direct) return direct;

  const fromComponents = flattenComponentText(m.components);
  if (fromComponents) return fromComponents;

  const embedParts: string[] = [];
  for (const e of m.embeds || []) {
    if (e.title?.trim()) embedParts.push(e.title.trim());
    if (e.description?.trim()) embedParts.push(e.description.trim());
    for (const f of e.fields || []) {
      const n = f.name?.trim();
      const v = f.value?.trim();
      if (n || v) embedParts.push([n, v].filter(Boolean).join("\n"));
    }
  }
  if (embedParts.length) return embedParts.join("\n\n");

  const stickers = (m.sticker_items || [])
    .map((s) => s.name?.trim())
    .filter(Boolean);
  if (stickers.length) return stickers.map((n) => `[스티커: ${n}]`).join(" ");

  return "";
}

function flattenComponentText(components: unknown[] | undefined): string {
  if (!Array.isArray(components) || !components.length) return "";
  const parts: string[] = [];

  const walk = (nodes: unknown[]) => {
    for (const raw of nodes) {
      if (!raw || typeof raw !== "object") continue;
      const n = raw as {
        type?: number;
        content?: string;
        label?: string;
        placeholder?: string;
        components?: unknown[];
        accessory?: unknown;
      };
      // TEXT_DISPLAY = 10
      if (typeof n.content === "string" && n.content.trim()) {
        parts.push(n.content.trim());
      }
      if (typeof n.label === "string" && n.label.trim() && n.type === 2) {
        parts.push(`[버튼: ${n.label.trim()}]`);
      }
      if (Array.isArray(n.components)) walk(n.components);
      if (n.accessory && typeof n.accessory === "object") walk([n.accessory]);
    }
  };

  walk(components);
  return parts.join("\n").trim();
}

export async function fetchChannelMessages(
  channelId: string,
  limit = 100,
): Promise<TranscriptMessage[]> {
  const collected: TranscriptMessage[] = [];
  let before: string | undefined;
  while (collected.length < 500) {
    const q = new URLSearchParams({ limit: String(Math.min(100, limit)) });
    if (before) q.set("before", before);
    const res = await ticketBotRest("GET", `/channels/${channelId}/messages?${q}`);
    if (!res.ok || !Array.isArray(res.json) || res.json.length === 0) break;
    const batch = res.json as {
      id: string;
      content?: string;
      timestamp?: string;
      embeds?: {
        title?: string;
        description?: string;
        fields?: { name?: string; value?: string }[];
      }[];
      components?: unknown[];
      sticker_items?: { name?: string }[];
      author?: {
        id?: string;
        username?: string;
        global_name?: string | null;
        avatar?: string | null;
        bot?: boolean;
      };
      attachments?: {
        id?: string;
        filename?: string;
        url?: string;
        content_type?: string | null;
        size?: number;
      }[];
    }[];

    for (const m of batch) {
      const authorId = m.author?.id || "0";
      const authorName =
        m.author?.global_name?.trim() || m.author?.username || "unknown";
      const avatar = m.author?.avatar
        ? `https://cdn.discordapp.com/avatars/${authorId}/${m.author.avatar}.png?size=64`
        : null;
      const content = extractMessageBody(m);
      collected.push({
        id: m.id,
        authorId,
        authorName,
        authorAvatarUrl: avatar,
        content:
          content ||
          (m.attachments?.length
            ? "(첨부 파일)"
            : m.author?.bot
              ? "(봇 메시지)"
              : "(내용 없음 — 봇에 Message Content Intent가 필요할 수 있어요)"),
        attachments: (m.attachments || []).map((a) => ({
          id: a.id || "",
          filename: a.filename || "file",
          url: a.url || "",
          contentType: a.content_type ?? null,
          size: Number(a.size) || 0,
        })),
        createdAt: m.timestamp || new Date().toISOString(),
        bot: Boolean(m.author?.bot),
      });
    }

    before = batch[batch.length - 1]?.id;
    if (batch.length < 100) break;
  }

  return collected.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** View channel + send messages bits */
export const PERM_VIEW_SEND = String(BigInt(0x400) | BigInt(0x800) | BigInt(0x40) | BigInt(0x4000));
export const PERM_DENY_ALL = "0";
export const PERM_ALLOW_NONE = "0";
