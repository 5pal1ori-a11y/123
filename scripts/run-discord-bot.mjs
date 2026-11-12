/**
 * Local Discord gateway presence for Vendix.
 * Loads DISCORD_BOT_TOKEN from env, .dev.vars, or .env.local (never prints the token).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const vendixRoot = "C:\\vendix";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(resolve(root, ".dev.vars"));
loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(vendixRoot, ".dev.vars"));
loadEnvFile(resolve(vendixRoot, ".env.local"));

const token = (process.env.DISCORD_BOT_TOKEN || "").trim();
if (!token) {
  console.error("[discord-bot] DISCORD_BOT_TOKEN missing (.dev.vars / .env.local / env)");
  process.exit(1);
}

let WebSocket;
try {
  WebSocket = require("ws");
} catch {
  console.error("[discord-bot] Installing ws…");
  const { execSync } = await import("node:child_process");
  execSync("npm install ws --no-save", { cwd: root, stdio: "inherit" });
  WebSocket = require("ws");
}

const GATEWAY = "wss://gateway.discord.gg/?v=10&encoding=json";
const INTENTS = 0; // presence only — slash commands still go to Workers interactions URL

let ws;
let hb = null;
let seq = null;
let sessionId = null;

function send(op, d) {
  ws.send(JSON.stringify({ op, d }));
}

function identify() {
  send(2, {
    token,
    intents: INTENTS,
    properties: { os: "windows", browser: "vendix", device: "vendix" },
    presence: {
      status: "online",
      activities: [{ name: "Vendix 자판기", type: 0 }],
      afk: false,
    },
  });
}

function resume() {
  if (!sessionId) {
    identify();
    return;
  }
  send(6, { token, session_id: sessionId, seq });
}

function startHeartbeat(ms) {
  if (hb) clearInterval(hb);
  hb = setInterval(() => send(1, seq), ms);
}

function connect() {
  ws = new WebSocket(GATEWAY);
  ws.on("open", () => console.log("[discord-bot] gateway connecting…"));
  ws.on("close", (code) => {
    console.log(`[discord-bot] closed ${code}, reconnect in 3s`);
    if (hb) clearInterval(hb);
    setTimeout(connect, 3000);
  });
  ws.on("error", (err) => console.error("[discord-bot] ws error", err.message));
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.s != null) seq = msg.s;
    switch (msg.op) {
      case 10:
        startHeartbeat(msg.d.heartbeat_interval);
        if (sessionId) resume();
        else identify();
        break;
      case 11:
        break;
      case 0:
        if (msg.t === "READY") {
          sessionId = msg.d.session_id;
          const user = msg.d.user;
          console.log(
            `[discord-bot] online as ${user?.username ?? "bot"}#${user?.discriminator ?? "0"}`,
          );
          console.log("[discord-bot] slash commands still handled by https://vendix.team/api/discord/interactions");
        } else if (msg.t === "RESUMED") {
          console.log("[discord-bot] session resumed");
        }
        break;
      case 7:
        ws.close();
        break;
      case 9:
        sessionId = null;
        setTimeout(identify, 2000);
        break;
      default:
        break;
    }
  });
}

console.log("[discord-bot] starting gateway presence…");
connect();
