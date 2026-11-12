/** 월드 멀티플레이 입장권 — Next 라우트가 서명하고 Durable Object가 검증한다 (WebCrypto만 사용) */

export type WorldTicket = {
  /** 사용자 ID */
  u: string;
  /** 표시 이름 (디스코드 닉네임) */
  n: string;
  /** 상점 슬러그 */
  s: string;
  /** 만료 (ms) */
  e: number;
  /** 마인크래프트 UUID (스킨) */
  k?: string | null;
};

const enc = new TextEncoder();

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(`world-ticket:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function signWorldTicket(ticket: WorldTicket, secret: string) {
  const body = b64url(enc.encode(JSON.stringify(ticket)));
  return `${body}.${b64url(await hmac(secret, body))}`;
}

export async function verifyWorldTicket(token: string, secret: string): Promise<WorldTicket | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig || !secret) return null;
  const expected = b64url(await hmac(secret, body));
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const t = JSON.parse(new TextDecoder().decode(fromB64url(body))) as WorldTicket;
    if (typeof t.u !== "string" || typeof t.n !== "string" || typeof t.s !== "string" || typeof t.e !== "number") return null;
    if (Date.now() > t.e) return null;
    return t;
  } catch {
    return null;
  }
}
