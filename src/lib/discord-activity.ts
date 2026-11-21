/**
 * 디스코드 액티비티(디스코드 앱 안에서 열리는 DOES 상점) — 로그인 · 세션
 *
 * 흐름: 액티비티가 Embedded App SDK 로 authorize → code 를 /api/activity/token 에 보냄
 *   → 서버가 DOES 앱 비밀값으로 code 를 access_token 으로 바꾸고 /users/@me 로 디스코드 ID 확인
 *   → 그 디스코드 ID 로 연결된 상점 회원을 찾아 12시간짜리 서명 세션을 준다 (쿠키 대신 Authorization 헤더 —
 *     디스코드 안 iframe 은 제3자 쿠키가 막히는 경우가 많다)
 */
import { createHmac, timingSafeEqual } from "crypto";
import { getAuthSecret } from "@/lib/auth";

const TTL_MS = 12 * 3_600_000;
type Payload = { uid: string; did: string; exp: number };

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (body: string) => createHmac("sha256", `${getAuthSecret()}:activity`).update(body).digest("base64url");

export function signActivitySession(uid: string, did: string) {
  const body = b64(JSON.stringify({ uid, did, exp: Date.now() + TTL_MS } satisfies Payload));
  return `${body}.${sign(body)}`;
}

export function verifyActivitySession(token: string | null | undefined): Payload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = sign(body);
  if (want.length !== sig.length || !timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

/** 요청의 Authorization: Bearer 세션 → 상점 회원 */
export async function activityUser(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const p = verifyActivitySession(token);
  if (!p) return null;
  const { initStore, getShopBySlug, getUserById, MFA_SHOP_SLUG } = await import("@/lib/store");
  await initStore();
  const shop = getShopBySlug(MFA_SHOP_SLUG);
  const user = getUserById(p.uid);
  if (!shop || !user || user.shopId !== shop.id || user.discordId !== p.did || user.banned) return null;
  return { shop, user };
}

/** code → 디스코드 access_token · 디스코드 사용자 */
export async function exchangeActivityCode(code: string) {
  const { doesDiscordEnvAsync } = await import("@/lib/discord/does-env");
  const env = await doesDiscordEnvAsync();
  if (!env.clientSecret) throw new Error("DOES 앱 비밀값(VERIFY_DISCORD_CLIENT_SECRET)이 설정되지 않았어요.");
  const res = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.applicationId, client_secret: env.clientSecret, grant_type: "authorization_code", code }),
  });
  const tok = (await res.json().catch(() => null)) as { access_token?: string; error?: string } | null;
  if (!res.ok || !tok?.access_token) throw new Error(`디스코드 로그인에 실패했어요. (${tok?.error ?? res.status})`);
  const me = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${tok.access_token}` } });
  const u = (await me.json().catch(() => null)) as { id?: string; username?: string; global_name?: string | null; avatar?: string | null } | null;
  if (!me.ok || !u?.id) throw new Error("디스코드 계정 정보를 받지 못했어요.");
  return { accessToken: tok.access_token, discord: { id: u.id, name: u.global_name || u.username || "회원", avatar: u.avatar ?? null } };
}
