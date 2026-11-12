import { DISCORD_API } from "@/lib/discord/components";
import { VENDIX_DISCORD_COMMANDS } from "@/lib/discord/commands-list";
import { discordEnv, discordEnvAsync } from "@/lib/discord/verify";
import { getDiscordCredentials } from "@/lib/store";

export { VENDIX_DISCORD_COMMANDS };

export async function discordRest(
  method: string,
  path: string,
  body?: unknown,
  shopId?: string,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  let botToken = "";
  if (shopId) {
    botToken = getDiscordCredentials(shopId).botToken;
  }
  // Workers secrets live on Cloudflare env — always fall back if shop token empty
  if (!botToken) {
    const env = await discordEnvAsync();
    botToken = env.botToken || discordEnv().botToken;
  }
  if (!botToken) {
    console.error("[discord-rest] DISCORD_BOT_TOKEN missing", { shopId: shopId ?? null, path });
    return { ok: false, status: 0, json: { error: "DISCORD_BOT_TOKEN missing" } };
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
    console.error("[discord-rest]", method, path, res.status, json);
  }
  return { ok: res.ok, status: res.status, json };
}

export async function fetchDiscordGuildOwnerId(
  guildId: string,
  shopId?: string,
): Promise<string | null> {
  const result = await discordRest("GET", `/guilds/${guildId}`, undefined, shopId);
  if (!result.ok || !result.json || typeof result.json !== "object") return null;
  const ownerId = (result.json as { owner_id?: string }).owner_id;
  return typeof ownerId === "string" && ownerId ? ownerId : null;
}

export async function listGuildTextChannels(guildId: string, shopId: string) {
  return discordRest("GET", `/guilds/${guildId}/channels`, undefined, shopId);
}

export async function postChannelMessage(
  channelId: string,
  payload: {
    content?: string;
    flags?: number;
    components?: unknown[];
    embeds?: unknown[];
    allowed_mentions?: unknown;
    message_reference?: unknown;
  },
  shopId?: string,
) {
  return discordRest("POST", `/channels/${channelId}/messages`, payload, shopId);
}

export async function editChannelMessage(
  channelId: string,
  messageId: string,
  payload: {
    content?: string | null;
    flags?: number;
    components?: unknown[];
    embeds?: unknown[] | null;
    allowed_mentions?: unknown;
  },
  shopId?: string,
) {
  return discordRest(
    "PATCH",
    `/channels/${channelId}/messages/${messageId}`,
    payload,
    shopId,
  );
}

/** Edit the original interaction response (ephemeral/public) — token valid ~15m */
export async function editInteractionOriginal(
  applicationId: string,
  interactionToken: string,
  payload: Record<string, unknown>,
) {
  const res = await fetch(
    `${DISCORD_API}/webhooks/${applicationId}/${interactionToken}/messages/@original`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    console.error("[discord-rest] editInteractionOriginal", res.status, json);
  }
  return { ok: res.ok, status: res.status, json };
}

export async function registerGuildCommands(
  guildId: string,
  commands: unknown[],
  opts?: { applicationId?: string; botToken?: string; shopId?: string },
) {
  let applicationId = opts?.applicationId ?? "";
  let botToken = opts?.botToken ?? "";
  if (opts?.shopId) {
    const creds = getDiscordCredentials(opts.shopId);
    applicationId = applicationId || creds.applicationId;
    botToken = botToken || creds.botToken;
  }
  if (!applicationId || !botToken) {
    const env = await discordEnvAsync();
    applicationId = applicationId || env.applicationId;
    botToken = botToken || env.botToken;
  }
  if (!applicationId) return { ok: false as const, error: "Application ID가 없어요." };
  if (!botToken) return { ok: false as const, error: "Bot Token이 없어요." };

  const res = await fetch(
    `${DISCORD_API}/applications/${applicationId}/guilds/${guildId}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    },
  );
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
