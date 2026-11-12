import { clientIp } from "@/lib/request-meta";

type AccessSettings = {
  koreaOnlyAccess?: boolean;
  blockVpnProxy?: boolean;
};

type AccessOk = { ok: true };
type AccessDeny = { ok: false; error: string; code: "geo" | "vpn" | "tor" };

const vpnCache = new Map<string, { at: number; blocked: boolean }>();
const CACHE_MS = 30 * 60_000;

export function clientCountry(request: Request): string {
  return (
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-vercel-ip-country") ??
    ""
  )
    .trim()
    .toUpperCase();
}

export function isLocalOrPrivateIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (!v || v === "unknown" || v === "127.0.0.1" || v === "::1" || v === "0.0.0.0") {
    return true;
  }
  if (v.startsWith("10.") || v.startsWith("192.168.") || v.startsWith("fc") || v.startsWith("fd")) {
    return true;
  }
  const m = v.match(/^172\.(\d+)\./);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
}

function looksLikeProxyHeaders(request: Request): boolean {
  const via = request.headers.get("via");
  const forwarded = request.headers.get("forwarded");
  const xff = request.headers.get("x-forwarded-for");
  if (via && /proxy|squid|cloudflare/i.test(via) === false && via.length > 0) {
    // Via present from non-CF hop — weak signal only when combined with API
  }
  if (xff && xff.split(",").length >= 4) return true;
  if (forwarded && forwarded.split(",").length >= 3) return true;
  return false;
}

async function detectVpnOrProxy(ip: string, request: Request): Promise<boolean> {
  if (isLocalOrPrivateIp(ip)) return false;

  const cached = vpnCache.get(ip);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.blocked;

  let blocked = false;
  try {
    const url = `https://proxycheck.io/v2/${encodeURIComponent(ip)}?vpn=1&asn=1&risk=1`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown>;
      const row = data[ip] as
        | { proxy?: string; type?: string; risk?: number }
        | undefined;
      if (row) {
        const proxyYes = String(row.proxy ?? "no").toLowerCase() === "yes";
        const type = String(row.type ?? "").toLowerCase();
        const risk = typeof row.risk === "number" ? row.risk : 0;
        blocked =
          proxyYes ||
          type.includes("vpn") ||
          type.includes("proxy") ||
          type.includes("tor") ||
          risk >= 66;
      }
    }
  } catch {
    // fail-open on lookup errors; fall back to header heuristic only
    blocked = looksLikeProxyHeaders(request);
  }

  vpnCache.set(ip, { at: Date.now(), blocked });
  return blocked;
}

/** 상점 방문자 접근 제한 (한국 IP / VPN·프록시). 관리자 우회는 호출측에서. */
export async function evaluateShopVisitorAccess(
  request: Request,
  settings: AccessSettings,
): Promise<AccessOk | AccessDeny> {
  const country = clientCountry(request);
  if (country === "T1") {
    return {
      ok: false,
      error: "익명 네트워크(Tor)에서는 이용할 수 없어요.",
      code: "tor",
    };
  }

  if (settings.koreaOnlyAccess) {
    // XX/빈값: 로컬·헤더 없음 — 개발 허용. 프로덕션에서 명확한 해외만 차단.
    if (country && country !== "KR" && country !== "XX") {
      return {
        ok: false,
        error: "한국 IP에서만 이용할 수 있어요.",
        code: "geo",
      };
    }
  }

  if (settings.blockVpnProxy) {
    const ip = clientIp(request);
    const vpn = await detectVpnOrProxy(ip, request);
    if (vpn) {
      return {
        ok: false,
        error: "VPN·프록시 사용 시 접근이 제한돼요. 해제 후 다시 시도해 주세요.",
        code: "vpn",
      };
    }
  }

  return { ok: true };
}
