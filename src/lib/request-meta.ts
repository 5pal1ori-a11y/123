/** 클라이언트 IP / UA 파싱 (Cloudflare Workers) */
export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export function clientUserAgent(request: Request): string {
  return request.headers.get("user-agent") ?? "unknown";
}

export function deviceLabelFromUa(ua: string): string {
  const lower = ua.toLowerCase();
  let os = "기타";
  if (/iphone|ipad|ipod/.test(lower)) os = "iOS";
  else if (/android/.test(lower)) os = "Android";
  else if (/windows/.test(lower)) os = "Windows";
  else if (/macintosh|mac os/.test(lower)) os = "macOS";
  else if (/linux/.test(lower)) os = "Linux";

  let browser = "Browser";
  if (/edg\//.test(lower)) browser = "Edge";
  else if (/chrome\//.test(lower) && !/edg\//.test(lower)) browser = "Chrome";
  else if (/safari\//.test(lower) && !/chrome\//.test(lower)) browser = "Safari";
  else if (/firefox\//.test(lower)) browser = "Firefox";
  else if (/opr\//.test(lower) || /opera/.test(lower)) browser = "Opera";

  const mobile = /mobile|android|iphone|ipad/.test(lower) ? "모바일" : "PC";
  return `${os} · ${browser} (${mobile})`;
}

export function ipAllowed(client: string, whitelist: string[]): boolean {
  if (!whitelist.length) return true;
  const normalized = client.trim();
  return whitelist.some((entry) => {
    const rule = entry.trim();
    if (!rule) return false;
    if (rule.endsWith("*")) {
      return normalized.startsWith(rule.slice(0, -1));
    }
    return normalized === rule;
  });
}
