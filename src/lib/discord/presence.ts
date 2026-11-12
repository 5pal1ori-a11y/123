/**
 * Discord Gateway presence updater.
 * Interaction-only bots stay Offline unless a gateway session sets presence.
 * Cron keeps a short-lived gateway session and sets:
 *   Listening to "N개 서버에서 사용중"
 */

import { discordEnvAsync } from "@/lib/discord/verify";
import { getShopSettings, initStore, listShops } from "@/lib/store";

const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";

function countLinkedServers() {
  let n = 0;
  for (const shop of listShops()) {
    const s = getShopSettings(shop.id);
    if (s.discordGuildId?.trim() && s.discordBotEnabled) n += 1;
  }
  return n;
}

function presencePayload(serverCount: number) {
  const name =
    serverCount <= 0 ? "DOES" : `${serverCount}개 서버에서 사용중`;
  return {
    op: 3,
    d: {
      since: null,
      activities: [
        {
          name,
          type: 2, // Listening
        },
      ],
      status: "online",
      afk: false,
    },
  };
}

export async function updateDiscordBotPresence(opts?: { botToken?: string }) {
  await initStore();
  const env = await discordEnvAsync();
  const token = (opts?.botToken || env.botToken || "").trim();
  if (!token) {
    return { ok: false as const, error: "DISCORD_BOT_TOKEN missing" };
  }

  const serverCount = countLinkedServers();

  return await new Promise<{ ok: boolean; serverCount: number; error?: string }>((resolve) => {
    let settled = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let doneTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: { ok: boolean; serverCount: number; error?: string }) => {
      if (settled) return;
      settled = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (doneTimer) clearTimeout(doneTimer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    let ws: WebSocket;
    try {
      ws = new WebSocket(GATEWAY_URL);
    } catch (err) {
      resolve({
        ok: false,
        serverCount,
        error: err instanceof Error ? err.message : "WebSocket failed",
      });
      return;
    }

    doneTimer = setTimeout(() => {
      finish({ ok: true, serverCount });
    }, 12_000);

    ws.addEventListener("message", (ev) => {
      let msg: { op?: number; d?: { heartbeat_interval?: number }; t?: string };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }

      if (msg.op === 10) {
        const interval = msg.d?.heartbeat_interval ?? 41250;
        ws.send(
          JSON.stringify({
            op: 2,
            d: {
              token,
              intents: 0,
              properties: {
                os: "linux",
                browser: "vendix",
                device: "vendix",
              },
              presence: {
                since: null,
                activities: [
                  {
                    name:
                      serverCount <= 0
                        ? "DOES"
                        : `${serverCount}개 서버에서 사용중`,
                    type: 2,
                  },
                ],
                status: "online",
                afk: false,
              },
            },
          }),
        );
        heartbeatTimer = setInterval(() => {
          try {
            ws.send(JSON.stringify({ op: 1, d: null }));
          } catch {
            /* ignore */
          }
        }, Math.max(5000, interval * 0.9));
        // reinforce presence
        setTimeout(() => {
          try {
            ws.send(JSON.stringify(presencePayload(serverCount)));
          } catch {
            /* ignore */
          }
        }, 1500);
      }

      if (msg.t === "READY") {
        try {
          ws.send(JSON.stringify(presencePayload(serverCount)));
        } catch {
          /* ignore */
        }
      }
    });

    ws.addEventListener("error", () => {
      finish({ ok: false, serverCount, error: "gateway error" });
    });

    ws.addEventListener("close", () => {
      finish({ ok: true, serverCount });
    });
  });
}
