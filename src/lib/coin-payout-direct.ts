/**
 * 자동송금 (VPS 없이) — Cloudflare Worker 에서 NOWPayments 송금을 직접 호출한다.
 *
 * 릴레이 서버(relay/coin-payout) 대신, 자격증명을 Cloudflare 시크릿에 넣고 Worker 가 바로 송금한다.
 *   NP_API_KEY · NP_EMAIL · NP_PASSWORD · NP_TOTP_SECRET
 *
 * ⚠️ NOWPayments 계정에서 "IP 화이트리스트"를 켜면 Worker IP 가 고정이 아니라 막힌다.
 *    자동송금을 쓰려면 NOWPayments 대시보드에서 IP 제한을 끄거나, 그때는 릴레이(고정 IP) 방식을 써야 한다.
 *
 * Worker 는 긴 폴링을 못 하므로: 송금 생성+2FA 확인까지만 즉시 하고(=sending),
 * 상태는 관리자가 "상태 확인"을 누르거나 손님이 조회할 때 checkPayoutStatus 로 확인한다.
 */
import { createHmac } from "crypto";

const API = "https://api.nowpayments.io/v1";

export async function nowpaymentsPayoutConfig() {
  const read = (k: string) => (process.env[k] ?? "").trim();
  let cfg = {
    apiKey: read("NP_API_KEY"),
    email: read("NP_EMAIL"),
    password: read("NP_PASSWORD"),
    totpSecret: read("NP_TOTP_SECRET"),
  };
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const e = env as Record<string, string | undefined>;
    cfg = {
      apiKey: (e.NP_API_KEY ?? cfg.apiKey)?.trim() || "",
      email: (e.NP_EMAIL ?? cfg.email)?.trim() || "",
      password: (e.NP_PASSWORD ?? cfg.password)?.trim() || "",
      totpSecret: (e.NP_TOTP_SECRET ?? cfg.totpSecret)?.trim() || "",
    };
  } catch {
    /* local */
  }
  const configured = Boolean(cfg.apiKey && cfg.email && cfg.password && cfg.totpSecret);
  return { ...cfg, configured };
}

/* ── TOTP (RFC 6238 · SHA1 · 30초 · 6자리) ── */
function base32(s: string): Buffer {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of s.replace(/[\s=-]/g, "").toUpperCase()) {
    const v = alpha.indexOf(ch);
    if (v < 0) throw new Error("NP_TOTP_SECRET 이 base32 형식이 아니에요");
    bits += v.toString(2).padStart(5, "0");
  }
  const out: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function totp(secret: string, t = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(t / 1000 / 30)));
  const h = createHmac("sha1", base32(secret)).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

/* ── NOWPayments ── */
let jwt = { token: "", at: 0 };
async function token(cfg: { email: string; password: string }): Promise<string> {
  if (jwt.token && Date.now() - jwt.at < 4 * 60_000) return jwt.token;
  const r = await fetch(`${API}/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: cfg.email, password: cfg.password }),
  });
  const j = (await r.json().catch(() => ({}))) as { token?: string; message?: string };
  if (!r.ok || !j.token) throw new Error(`NOWPayments 로그인 실패: ${j.message || r.status}`);
  jwt = { token: j.token, at: Date.now() };
  return j.token;
}

async function np(cfg: Awaited<ReturnType<typeof nowpaymentsPayoutConfig>>, method: string, path: string, body?: unknown, auth = true) {
  const headers: Record<string, string> = { "x-api-key": cfg.apiKey };
  if (auth) headers.authorization = `Bearer ${await token(cfg)}`;
  if (body) headers["content-type"] = "application/json";
  const r = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text);
  } catch {
    j = { raw: text };
  }
  if (!r.ok) throw new Error(`NOWPayments ${method} ${path} → ${r.status} ${(j.message as string) || text.slice(0, 200)}`);
  return j;
}

/** 송금 생성 + 2FA 확인 → payoutId(batchId) 반환 */
export async function createPayoutDirect(input: { currency: string; amount: number; address: string }): Promise<string> {
  const cfg = await nowpaymentsPayoutConfig();
  if (!cfg.configured) throw new Error("자동송금 자격증명(NOWPayments)이 설정돼 있지 않아요.");
  const created = await np(cfg, "POST", "/payout", {
    withdrawals: [{ address: input.address, currency: input.currency, amount: input.amount }],
  });
  const batchId = (created.id ?? created.batch_withdrawal_id) as string | number | undefined;
  if (!batchId) throw new Error(`송금 ID 를 못 받았어요: ${JSON.stringify(created).slice(0, 200)}`);
  // 2FA — 30초 경계에 걸리면 한 번 더
  try {
    await np(cfg, "POST", `/payout/${batchId}/verify`, { verification_code: totp(cfg.totpSecret) });
  } catch (e) {
    await new Promise((s) => setTimeout(s, 3000));
    await np(cfg, "POST", `/payout/${batchId}/verify`, { verification_code: totp(cfg.totpSecret) }).catch((e2: unknown) => {
      throw new Error(`2FA 확인 실패: ${e2 instanceof Error ? e2.message : ""} (첫 시도: ${e instanceof Error ? e.message : ""})`);
    });
  }
  return String(batchId);
}

/** NOWPayments 커스터디 잔액 — { currency: amount }. API 키만으로 먼저 시도하고, 안 되면 로그인 토큰을 붙인다 */
export async function nowpaymentsBalanceDetailed(): Promise<{ ok: boolean; balances: Record<string, number> | null; error: string | null }> {
  const cfg = await nowpaymentsPayoutConfig();
  if (!cfg.apiKey) return { ok: false, balances: null, error: "NP_API_KEY 없음" };
  const read = (j: Record<string, unknown>) => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(j)) {
      const amt = typeof v === "number" ? v : Number((v as { amount?: number })?.amount);
      if (Number.isFinite(amt) && amt > 0) out[k.toLowerCase()] = amt;
    }
    return out;
  };
  try {
    const r = await fetch(`${API}/balance`, { headers: { "x-api-key": cfg.apiKey } });
    const text = await r.text();
    if (r.ok) return { ok: true, balances: read(JSON.parse(text) as Record<string, unknown>), error: null };
    if (cfg.email && cfg.password) {
      const j = (await np(cfg, "GET", "/balance")) as Record<string, unknown>;
      return { ok: true, balances: read(j), error: null };
    }
    return { ok: false, balances: null, error: `${r.status} ${text.slice(0, 160)}` };
  } catch (e) {
    return { ok: false, balances: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function nowpaymentsBalance(): Promise<Record<string, number> | null> {
  return (await nowpaymentsBalanceDetailed()).balances;
}

const DONE_OK = new Set(["FINISHED"]);
const DONE_FAIL = new Set(["FAILED", "REJECTED", "EXPIRED"]);

/** 송금 상태 확인 — final 이면 done */
export async function checkPayoutStatus(payoutId: string): Promise<{ status: string; txid: string | null; error: string | null; final: "ok" | "fail" | null }> {
  const cfg = await nowpaymentsPayoutConfig();
  if (!cfg.configured) throw new Error("자동송금 자격증명이 설정돼 있지 않아요.");
  const j = await np(cfg, "GET", `/payout/${payoutId}`);
  const list = Array.isArray(j) ? j : Array.isArray((j as { withdrawals?: unknown[] }).withdrawals) ? (j as { withdrawals: Record<string, unknown>[] }).withdrawals : [j];
  const w = (list[0] || {}) as Record<string, unknown>;
  const status = String(w.status || "").toUpperCase();
  const txid = (w.hash as string) || (w.tx_hash as string) || null;
  const error = (w.error as string) || null;
  const final = DONE_OK.has(status) ? "ok" : DONE_FAIL.has(status) ? "fail" : null;
  return { status, txid, error, final };
}
