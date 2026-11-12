import { shopUrl } from "@/lib/domain";

/**
 * Microsoft 계정(개인 계정 — 마인크래프트 계정과 같은 종류) 로그인.
 * Azure 앱 등록 후 MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET 를 설정해야 켜진다.
 *
 * 테넌트를 consumers 로 고정한다: 회사·학교 테넌트의 email 클레임은 검증되지 않아 계정 탈취에 쓰일 수 있다.
 */
const AUTHORITY = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
/** XboxLive.signin 은 마인크래프트 프로필(닉네임·스킨) 확인에만 쓴다 */
const SCOPE = "openid profile email XboxLive.signin";

export function microsoftEnv() {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim() ?? "";
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
}

/** 콜백은 상점 도메인에서 바로 받아 세션 쿠키를 그 도메인에 굽는다 */
export function microsoftRedirectUri(shopSlug: string) {
  return shopUrl(shopSlug, "/api/auth/user/microsoft/callback");
}

export function buildMicrosoftAuthorizeUrl(opts: { clientId: string; redirectUri: string; state: string }) {
  const url = new URL(`${AUTHORITY}/authorize`);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", opts.state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export type MinecraftIdentity = { uuid: string; name: string };

export type MicrosoftProfile = {
  id: string;
  name: string;
  email: string | null;
  /** undefined: 조회 실패(예전 값 유지) · null: 마인크래프트를 안 가진 계정 */
  minecraft: MinecraftIdentity | null | undefined;
};

async function postJson<T>(url: string, body: unknown): Promise<{ status: number; data: T | null }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  return { status: res.status, data: res.ok ? ((await res.json().catch(() => null)) as T | null) : null };
}

/**
 * Microsoft 액세스 토큰 → Xbox Live → XSTS → 마인크래프트 프로필.
 * 거쳐 가는 토큰은 이 함수 안에서만 쓰고 어디에도 저장하거나 로그로 남기지 않는다.
 * 새 Azure 앱은 Mojang 승인 전까지 login_with_xbox 가 403 을 준다 (https://aka.ms/mce-reviewappid).
 */
async function fetchMinecraftIdentity(msAccessToken: string): Promise<MinecraftIdentity | null | undefined> {
  try {
    const xbl = await postJson<{ Token?: string; DisplayClaims?: { xui?: { uhs?: string }[] } }>(
      "https://user.auth.xboxlive.com/user/authenticate",
      {
        Properties: { AuthMethod: "RPS", SiteName: "user.auth.xboxlive.com", RpsTicket: `d=${msAccessToken}` },
        RelyingParty: "http://auth.xboxlive.com",
        TokenType: "JWT",
      },
    );
    const uhs = xbl.data?.DisplayClaims?.xui?.[0]?.uhs;
    if (!xbl.data?.Token || !uhs) {
      console.warn("[microsoft-oauth] xbox live auth failed", xbl.status);
      return undefined;
    }

    const xsts = await postJson<{ Token?: string }>("https://xsts.auth.xboxlive.com/xsts/authorize", {
      Properties: { SandboxId: "RETAIL", UserTokens: [xbl.data.Token] },
      RelyingParty: "rp://api.minecraftservices.com/",
      TokenType: "JWT",
    });
    // 401: Xbox 프로필이 없는 계정 등 — 마인크래프트도 없다고 본다
    if (xsts.status === 401) return null;
    if (!xsts.data?.Token) {
      console.warn("[microsoft-oauth] xsts failed", xsts.status);
      return undefined;
    }

    const mc = await postJson<{ access_token?: string }>("https://api.minecraftservices.com/authentication/login_with_xbox", {
      identityToken: `XBL3.0 x=${uhs};${xsts.data.Token}`,
    });
    if (!mc.data?.access_token) {
      console.warn("[microsoft-oauth] minecraft login_with_xbox failed", mc.status);
      return undefined;
    }

    const res = await fetch("https://api.minecraftservices.com/minecraft/profile", {
      headers: { authorization: `Bearer ${mc.data.access_token}`, accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.warn("[microsoft-oauth] minecraft profile failed", res.status);
      return undefined;
    }
    const profile = (await res.json().catch(() => null)) as { id?: string; name?: string } | null;
    const uuid = profile?.id?.toLowerCase().replace(/-/g, "") ?? "";
    if (!/^[0-9a-f]{32}$/.test(uuid) || !profile?.name) return undefined;
    return { uuid, name: profile.name };
  } catch (err) {
    console.warn("[microsoft-oauth] minecraft lookup error", err instanceof Error ? err.name : "unknown");
    return undefined;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 인가 코드를 토큰으로 바꾸고 id_token 에서 프로필을 꺼낸다.
 * id_token 은 클라이언트 시크릿으로 인증한 토큰 엔드포인트에서 TLS 로 직접 받으므로 서명 검증 대신 aud · exp 만 확인한다 (OIDC Core 3.1.3.7).
 */
export async function exchangeMicrosoftCode(opts: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<MicrosoftProfile | { error: string }> {
  const res = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: opts.code,
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
      scope: SCOPE,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    id_token?: string;
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.id_token) {
    console.error("[microsoft-oauth] token exchange failed", res.status, data.error);
    return { error: data.error || `token ${res.status}` };
  }
  const claims = decodeJwtPayload(data.id_token);
  if (!claims) return { error: "id_token" };
  if (claims.aud !== opts.clientId) return { error: "aud" };
  if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return { error: "exp" };
  const id = typeof claims.sub === "string" ? claims.sub : "";
  if (!id) return { error: "sub" };
  const email =
    (typeof claims.email === "string" && claims.email) ||
    (typeof claims.preferred_username === "string" && claims.preferred_username.includes("@") ? claims.preferred_username : "") ||
    null;
  const name = (typeof claims.name === "string" && claims.name.trim()) || (email ? email.split("@")[0]! : "Microsoft 사용자");
  const minecraft = data.access_token ? await fetchMinecraftIdentity(data.access_token) : undefined;
  return { id, name, email, minecraft };
}
