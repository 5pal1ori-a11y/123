export async function verifyTurnstileToken(opts: {
  token: string | null | undefined;
  ip?: string | null;
  expectedAction: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const secret = process.env.TURNSTILE_SECRET?.trim() || process.env.VERIFY_TURNSTILE_SECRET?.trim();
  if (!secret) {
    return { ok: false, error: "Turnstile 시크릿이 설정되지 않았어요." };
  }
  const token = opts.token?.trim() ?? "";
  if (!token || token.length > 2048) {
    return { ok: false, error: "캡차 토큰이 없어요." };
  }

  const hostnames = new Set(
    (process.env.TURNSTILE_HOSTNAMES || process.env.VERIFY_TURNSTILE_HOSTNAMES || "verify.vendix.team,vendix.team")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );

  try {
    const body = new URLSearchParams({
      secret,
      response: token,
    });
    if (opts.ip) body.set("remoteip", opts.ip);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      action?: string;
      hostname?: string;
      "error-codes"?: string[];
    } | null;
    if (!res.ok || !json?.success) {
      return { ok: false, error: "캡차 검증에 실패했어요." };
    }
    if (json.action && json.action !== opts.expectedAction) {
      return { ok: false, error: "캡차 action이 올바르지 않아요." };
    }
    if (json.hostname && hostnames.size > 0 && !hostnames.has(json.hostname.toLowerCase())) {
      return { ok: false, error: "캡차 hostname이 허용되지 않아요." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "캡차 서버에 연결하지 못했어요." };
  }
}

export function turnstileSiteKey() {
  return (
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_VERIFY_TURNSTILE_SITE_KEY?.trim() ||
    ""
  );
}
