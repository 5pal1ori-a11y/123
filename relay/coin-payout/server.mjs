#!/usr/bin/env node
/**
 * DOES 코인대행 송금 중계 서버 — 고정 IP VPS 에서 돌린다 (Node 18+, 의존성 없음).
 *
 * NOWPayments 송금(Payout) API 는 허용된 IP 에서만, 2FA 확인을 거쳐야 보낼 수 있다.
 * Cloudflare Workers 는 고정 IP 가 없어서, 사이트는 이 서버에 서명된 요청만 보내고
 * 이 서버가 로그인(JWT) → 송금 생성 → 2FA(TOTP) 확인 → 상태 확인 → 결과를 사이트로 알려 준다.
 *
 * 환경 변수 (.env 또는 systemd Environment=):
 *   RELAY_SECRET     사이트 COIN_RELAY_SECRET 과 같은 값 (32자 이상 무작위)
 *   NP_API_KEY       NOWPayments API 키
 *   NP_EMAIL         NOWPayments 로그인 이메일
 *   NP_PASSWORD      NOWPayments 로그인 비밀번호
 *   NP_TOTP_SECRET   NOWPayments 2FA(구글 OTP) 설정 때 받은 base32 시크릿
 *   CALLBACK_HOSTS   결과를 보내도 되는 호스트 (기본 doesmc.xyz)
 *   MAX_AMOUNTS      한 건 최대 수량, 예: "ltc:20,usdttrc20:800" (기본값 아래)
 *   PORT             기본 8787 · DATA_FILE 기본 ./payouts.json
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";

const env = (k, d = "") => (process.env[k] ?? d).trim();
const SECRET = env("RELAY_SECRET");
const NP_KEY = env("NP_API_KEY");
const NP_EMAIL = env("NP_EMAIL");
const NP_PASSWORD = env("NP_PASSWORD");
const NP_TOTP = env("NP_TOTP_SECRET");
const PORT = Number(env("PORT", "8787"));
const DATA_FILE = env("DATA_FILE", "./payouts.json");
const CALLBACK_HOSTS = new Set(env("CALLBACK_HOSTS", "doesmc.xyz").split(",").map((s) => s.trim()).filter(Boolean));
const MAX_AMOUNTS = Object.fromEntries(
  env("MAX_AMOUNTS", "ltc:20,usdttrc20:800")
    .split(",")
    .map((p) => p.split(":"))
    .filter((p) => p.length === 2)
    .map(([c, n]) => [c.trim(), Number(n)]),
);
const API = "https://api.nowpayments.io/v1";

for (const [k, v] of Object.entries({ RELAY_SECRET: SECRET, NP_API_KEY: NP_KEY, NP_EMAIL, NP_PASSWORD, NP_TOTP_SECRET: NP_TOTP })) {
  if (!v) {
    console.error(`환경 변수 ${k} 가 비어 있어요.`);
    process.exit(1);
  }
}
if (SECRET.length < 32) {
  console.error("RELAY_SECRET 은 32자 이상으로 해 주세요.");
  process.exit(1);
}

/* ───────── 저장 (같은 주문을 두 번 보내지 않게) ───────── */
let db = {};
if (existsSync(DATA_FILE)) {
  try {
    db = JSON.parse(readFileSync(DATA_FILE, "utf8"));
  } catch {
    db = {};
  }
}
function save() {
  writeFileSync(`${DATA_FILE}.tmp`, JSON.stringify(db, null, 1));
  renameSync(`${DATA_FILE}.tmp`, DATA_FILE);
}

/* ───────── 서명 ───────── */
const sign = (ts, body) => createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");
function verify(req, body) {
  const ts = req.headers["x-relay-ts"];
  const sig = req.headers["x-relay-sig"];
  if (typeof ts !== "string" || typeof sig !== "string") return false;
  if (!Number.isFinite(Number(ts)) || Math.abs(Date.now() - Number(ts)) > 5 * 60_000) return false;
  const a = Buffer.from(sign(ts, body));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ───────── TOTP (RFC 6238, SHA1, 30초, 6자리) ───────── */
function base32(s) {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of s.replace(/[\s=-]/g, "").toUpperCase()) {
    const v = alpha.indexOf(ch);
    if (v < 0) throw new Error("NP_TOTP_SECRET 이 base32 형식이 아니에요");
    bits += v.toString(2).padStart(5, "0");
  }
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function totp(secret, t = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(t / 1000 / 30)));
  const h = createHmac("sha1", base32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
  return code;
}

/* ───────── NOWPayments ───────── */
let jwt = { token: "", at: 0 };
async function token() {
  if (jwt.token && Date.now() - jwt.at < 4 * 60_000) return jwt.token;
  const r = await fetch(`${API}/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: NP_EMAIL, password: NP_PASSWORD }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) throw new Error(`NOWPayments 로그인 실패: ${j.message || r.status}`);
  jwt = { token: j.token, at: Date.now() };
  return j.token;
}
async function np(method, path, body, auth = true) {
  const headers = { "x-api-key": NP_KEY };
  if (auth) headers.authorization = `Bearer ${await token()}`;
  if (body) headers["content-type"] = "application/json";
  const r = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    j = { raw: text };
  }
  if (!r.ok) throw new Error(`NOWPayments ${method} ${path} → ${r.status} ${j.message || text.slice(0, 200)}`);
  return j;
}

/** 송금 상태 — 응답 모양이 버전마다 달라서 넓게 읽는다 */
function readWithdrawal(j) {
  const list = Array.isArray(j) ? j : Array.isArray(j?.withdrawals) ? j.withdrawals : j ? [j] : [];
  const w = list[0] || {};
  return { status: String(w.status || "").toUpperCase(), hash: w.hash || w.tx_hash || null, error: w.error || null, id: w.id ?? null };
}

const DONE_OK = new Set(["FINISHED"]);
const DONE_FAIL = new Set(["FAILED", "REJECTED", "EXPIRED"]);

async function callback(rec, payload) {
  const body = JSON.stringify({ orderId: rec.orderId, ...payload });
  const ts = String(Date.now());
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(rec.callbackUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "x-relay-ts": ts, "x-relay-sig": sign(ts, body) },
        body,
      });
      if (r.ok || r.status === 400) return;
    } catch {
      /* 재시도 */
    }
    await new Promise((s) => setTimeout(s, 5000 * (i + 1)));
  }
  console.error("[callback] 사이트에 결과를 못 보냈어요", rec.orderId);
}

async function track(orderId) {
  const rec = db[orderId];
  if (!rec || rec.done) return;
  const deadline = Date.parse(rec.createdAt) + 6 * 3_600_000;
  while (Date.now() < deadline) {
    try {
      const w = readWithdrawal(await np("GET", `/payout/${rec.batchId}`));
      rec.status = w.status;
      if (DONE_OK.has(w.status)) {
        rec.done = true;
        rec.hash = w.hash;
        save();
        await callback(rec, { ok: true, txid: w.hash, payoutId: String(rec.batchId) });
        return;
      }
      if (DONE_FAIL.has(w.status)) {
        rec.done = true;
        save();
        await callback(rec, { ok: false, error: `NOWPayments 상태 ${w.status}${w.error ? ` · ${w.error}` : ""}`, payoutId: String(rec.batchId) });
        return;
      }
      save();
    } catch (e) {
      console.error("[track]", orderId, e.message);
    }
    await new Promise((s) => setTimeout(s, 30_000));
  }
  // 6시간이 지나도 안 끝나면 실패로 처리하지 않는다 (중복 송금 위험) — 관리자 확인 필요
  console.error("[track] 6시간 안에 끝나지 않음 — NOWPayments 대시보드에서 확인 필요", orderId);
}

async function createPayout(p) {
  const created = await np("POST", "/payout", {
    withdrawals: [{ address: p.address, currency: p.currency, amount: p.amount }],
  });
  const batchId = created.id ?? created.batch_withdrawal_id;
  if (!batchId) throw new Error(`송금 ID 를 못 받았어요: ${JSON.stringify(created).slice(0, 200)}`);
  // 2FA 확인 — 30초 경계에 걸리면 한 번 더
  try {
    await np("POST", `/payout/${batchId}/verify`, { verification_code: totp(NP_TOTP) });
  } catch (e) {
    await new Promise((s) => setTimeout(s, 3000));
    await np("POST", `/payout/${batchId}/verify`, { verification_code: totp(NP_TOTP) }).catch((e2) => {
      throw new Error(`2FA 확인 실패: ${e2.message} (첫 시도: ${e.message})`);
    });
  }
  return String(batchId);
}

/* ───────── HTTP ───────── */
function send(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) {
    chunks.push(c);
    if (chunks.reduce((n, x) => n + x.length, 0) > 16_384) return send(res, 413, { error: "too large" });
  }
  const body = Buffer.concat(chunks).toString("utf8");
  if (!verify(req, body)) return send(res, 401, { error: "invalid signature" });

  try {
    if (req.method === "GET" && req.url === "/balance") {
      return send(res, 200, await np("GET", "/balance", null, false));
    }
    if (req.method === "POST" && req.url === "/payout") {
      const p = JSON.parse(body);
      if (!p.orderId || typeof p.orderId !== "string") return send(res, 400, { ok: false, error: "orderId" });
      if (!/^[a-z0-9]+$/.test(p.currency || "")) return send(res, 400, { ok: false, error: "currency" });
      const amount = Number(p.amount);
      if (!(amount > 0)) return send(res, 400, { ok: false, error: "amount" });
      const max = MAX_AMOUNTS[p.currency];
      if (!max) return send(res, 400, { ok: false, error: `허용되지 않은 코인: ${p.currency}` });
      if (amount > max) return send(res, 400, { ok: false, error: `한 건 최대 ${max} ${p.currency} 를 넘어요` });
      if (typeof p.address !== "string" || !/^[0-9a-zA-Z]{20,100}$/.test(p.address)) return send(res, 400, { ok: false, error: "address" });
      let cb;
      try {
        cb = new URL(p.callbackUrl);
      } catch {
        return send(res, 400, { ok: false, error: "callbackUrl" });
      }
      if (cb.protocol !== "https:" || !CALLBACK_HOSTS.has(cb.hostname)) return send(res, 400, { ok: false, error: "callback host" });

      // 같은 주문은 한 번만
      const existing = db[p.orderId];
      if (existing) return send(res, 200, { ok: true, payoutId: existing.batchId ?? null, duplicate: true });
      db[p.orderId] = { orderId: p.orderId, currency: p.currency, amount, address: p.address, callbackUrl: cb.toString(), createdAt: new Date().toISOString(), batchId: null, status: "CREATING", done: false };
      save();
      try {
        const batchId = await createPayout({ address: p.address, currency: p.currency, amount });
        db[p.orderId].batchId = batchId;
        db[p.orderId].status = "VERIFIED";
        save();
        console.log("[payout]", p.orderId, p.currency, amount, "→", p.address, "batch", batchId);
        void track(p.orderId);
        return send(res, 200, { ok: true, payoutId: batchId });
      } catch (e) {
        // 송금 ID 를 받기 전에 실패했으면 기록을 지워 재시도할 수 있게, 받은 뒤면 남겨 둔다 (중복 송금 방지)
        if (!db[p.orderId].batchId) delete db[p.orderId];
        else db[p.orderId].status = "VERIFY_FAILED";
        save();
        console.error("[payout] 실패", p.orderId, e.message);
        return send(res, 502, { ok: false, error: e.message.slice(0, 300) });
      }
    }
    return send(res, 404, { error: "not found" });
  } catch (e) {
    return send(res, 500, { ok: false, error: e.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`coin-payout relay :${PORT} (HTTPS 는 앞단 Caddy 가 맡는다)`);
  // 재시작 전에 진행 중이던 송금은 계속 확인
  for (const id of Object.keys(db)) if (db[id].batchId && !db[id].done) void track(id);
});
