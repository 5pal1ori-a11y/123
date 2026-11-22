/**
 * 도스.com 로그인 — 새 도메인의 콜백 주소가 디스코드 앱 Redirects 에 등록돼 있을 때만 새 도메인으로 로그인한다.
 * 아직 등록 전이면 예전 주소(doesmc.xyz)로 로그인해서, 도메인을 옮기는 동안에도 로그인이 끊기지 않는다.
 */
import { LEGACY_SITE_ORIGIN, mfaOAuthOrigin } from "@/lib/domain";

let cache: { at: number; uris: string[] } | null = null;

async function registeredRedirects(): Promise<string[]> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.uris;
  try {
    const { doesDiscordEnvAsync } = await import("@/lib/discord/does-env");
    const token = (await doesDiscordEnvAsync()).botToken;
    if (!token) return [];
    const res = await fetch("https://discord.com/api/v10/applications/@me", { headers: { Authorization: `Bot ${token}` }, signal: AbortSignal.timeout(5000) });
    const app = (await res.json().catch(() => null)) as { redirect_uris?: string[] } | null;
    const uris = res.ok && Array.isArray(app?.redirect_uris) ? app!.redirect_uris! : [];
    cache = { at: Date.now(), uris };
    return uris;
  } catch {
    return [];
  }
}

/** 로그인 시작할 때 쓸 콜백 origin */
export async function mfaLoginOrigin(requestOrigin: string | null | undefined, callbackPath: string) {
  const want = mfaOAuthOrigin(requestOrigin);
  if (want === LEGACY_SITE_ORIGIN) return want;
  const uris = await registeredRedirects();
  return uris.includes(`${want}${callbackPath}`) ? want : LEGACY_SITE_ORIGIN;
}

/** 진단용 — 새 도메인 콜백이 등록됐는지 */
export async function doesRedirectStatus() {
  const uris = await registeredRedirects();
  return { uris, user: uris.some((u) => u.includes("xn--hq1b35z.com/api/auth/user/discord/callback")), admin: uris.some((u) => u.includes("xn--hq1b35z.com/api/auth/admin/discord/callback")) };
}
