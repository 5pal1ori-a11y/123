/**
 * Start Discord gateway using token from Cloudflare Worker secrets via wrangler,
 * or from shop settings in KV — never prints the token.
 */
import { spawnSync, spawn } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const vendix = "C:\\vendix";
const ns = "abda54aa8ee04d29b2e32c100b25c3f9";
const tmpToken = resolve(vendix, ".discord-bot-token.tmp");

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function tokenFromLocalFiles() {
  for (const p of [
    resolve(vendix, ".dev.vars"),
    resolve(vendix, ".env.local"),
    resolve(__dirname, "../.dev.vars"),
    resolve(__dirname, "../.env.local"),
  ]) {
    const env = loadEnvFile(p);
    if (env.DISCORD_BOT_TOKEN?.trim()) return env.DISCORD_BOT_TOKEN.trim();
  }
  return process.env.DISCORD_BOT_TOKEN?.trim() || "";
}

function tokenFromKv() {
  const r = spawnSync(
    "npx",
    ["wrangler", "kv", "key", "get", "vendix:db", `--namespace-id=${ns}`],
    { cwd: vendix, encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 },
  );
  if (r.status !== 0) return "";
  try {
    const db = JSON.parse(r.stdout);
    const settings = Array.isArray(db.settings) ? db.settings : [];
    for (const s of settings) {
      const t = String(s.discordBotToken || "").trim();
      if (t && !t.includes("•")) return t;
    }
  } catch {
    return "";
  }
  return "";
}

let token = tokenFromLocalFiles();
if (!token) {
  console.log("[discord-bot] local token missing — trying shop KV settings…");
  token = tokenFromKv();
}

if (!token) {
  console.error(
    "[discord-bot] No token found. Put DISCORD_BOT_TOKEN in C:\\vendix\\.dev.vars or enable bot token in shop Discord settings.",
  );
  process.exit(1);
}

writeFileSync(tmpToken, token, { encoding: "utf8", mode: 0o600 });
console.log(`[discord-bot] token loaded (len=${token.length}), starting gateway…`);

const child = spawn(
  process.execPath,
  [resolve(__dirname, "run-discord-bot.mjs")],
  {
    cwd: vendix,
    env: { ...process.env, DISCORD_BOT_TOKEN: token },
    stdio: "inherit",
    windowsHide: true,
  },
);

const cleanup = () => {
  try {
    if (existsSync(tmpToken)) unlinkSync(tmpToken);
  } catch {
    /* ignore */
  }
};
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  child.kill();
  process.exit(0);
});

child.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 0);
});
