/**
 * Vendix Security gateway bridge
 * Discord Gateway → POST /api/security-bot/gateway
 *
 * Usage:
 *   SECURITY_DISCORD_BOT_TOKEN=xxx SECURITY_API_BASE=https://vendix.team node security-gateway/run.mjs
 *
 * Required intents: Guilds, GuildMembers, GuildModeration, GuildMessages, MessageContent
 */
import WebSocket from "ws";

const TOKEN = process.env.SECURITY_DISCORD_BOT_TOKEN?.trim();
const API = (process.env.SECURITY_API_BASE || "https://vendix.team").replace(/\/$/, "");
const GATEWAY = "wss://gateway.discord.gg/?v=10&encoding=json";

if (!TOKEN) {
  console.error("SECURITY_DISCORD_BOT_TOKEN required");
  process.exit(1);
}

let seq = null;
let heartbeat = null;

async function postEvent(body) {
  const res = await fetch(`${API}/api/security-bot/gateway`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log("[gateway→api]", body.type, res.status, text.slice(0, 120));
}

function identify(ws) {
  ws.send(
    JSON.stringify({
      op: 2,
      d: {
        token: TOKEN,
        intents: (1 << 0) | (1 << 1) | (1 << 2) | (1 << 9) | (1 << 15),
        properties: { os: "linux", browser: "vendix-security", device: "vendix-security" },
      },
    }),
  );
}

const INVITE_RE = /discord(?:app)?\.com\/invite\/|discord\.gg\//i;

function connect() {
  const ws = new WebSocket(GATEWAY);
  ws.on("open", () => console.log("[ws] open"));
  ws.on("close", () => {
    console.log("[ws] close — reconnect in 5s");
    if (heartbeat) clearInterval(heartbeat);
    setTimeout(connect, 5000);
  });
  ws.on("error", (e) => console.error("[ws] error", e.message));
  ws.on("message", async (raw) => {
    const packet = JSON.parse(String(raw));
    if (packet.s) seq = packet.s;
    if (packet.op === 10) {
      const interval = packet.d.heartbeat_interval;
      heartbeat = setInterval(() => {
        ws.send(JSON.stringify({ op: 1, d: seq }));
      }, interval);
      identify(ws);
      return;
    }
    if (packet.op !== 0) return;

    const t = packet.t;
    const d = packet.d;

    if (t === "READY") {
      console.log("[ready]", d.user?.username);
    }

    if (t === "GUILD_MEMBER_ADD") {
      await postEvent({
        type: "member_join",
        guildId: d.guild_id,
        userId: d.user?.id,
        username: d.user?.global_name || d.user?.username,
        avatar: d.user?.avatar ?? null,
      });
    }

    if (t === "GUILD_MEMBER_UPDATE" && d.roles) {
      await postEvent({
        type: "admin_grant",
        guildId: d.guild_id,
        userId: d.user?.id,
        username: d.user?.username,
        roleIds: d.roles,
      });
    }

    if (t === "CHANNEL_DELETE") {
      await postEvent({
        type: "nuke_alert",
        guildId: d.guild_id,
        actorId: "unknown",
        detail: `채널 삭제: #${d.name || d.id}`,
        kind: "channel_delete",
        targetId: d.id,
      });
    }

    if (t === "GUILD_BAN_ADD") {
      await postEvent({
        type: "nuke_alert",
        guildId: d.guild_id,
        actorId: "unknown",
        detail: `밴: ${d.user?.username || d.user?.id}`,
        kind: "ban",
        targetId: d.user?.id,
      });
    }

    if (t === "MESSAGE_CREATE" && d.content && !d.author?.bot) {
      const c = String(d.content);
      const roleIds = Array.isArray(d.member?.roles) ? d.member.roles : [];
      const base = {
        guildId: d.guild_id,
        userId: d.author?.id,
        username: d.author?.username,
        channelId: d.channel_id,
        messageId: d.id,
        roleIds,
      };
      if (c.includes("@everyone") || c.includes("@here")) {
        await postEvent({
          type: "everyone_spam",
          ...base,
          content: c.slice(0, 200),
        });
      }
      if (INVITE_RE.test(c)) {
        await postEvent({
          type: "message_spam",
          kind: "invite",
          ...base,
          content: c.slice(0, 200),
        });
      }
      await postEvent({
        type: "message_spam",
        kind: "flood",
        ...base,
        content: c.slice(0, 80),
      });
    }
  });
}

connect();
