/**
 * Simple in-memory rate limiter (per Worker isolate).
 * Best-effort defense for auth / abuse endpoints — pair with Cloudflare WAF when possible.
 */

type Bucket = { count: number; resetAt: number };

const g = globalThis as unknown as { __vendixRateBuckets?: Map<string, Bucket> };

function buckets() {
  if (!g.__vendixRateBuckets) g.__vendixRateBuckets = new Map();
  return g.__vendixRateBuckets;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const map = buckets();
  let b = map.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    map.set(key, b);
  }
  b.count += 1;
  if (b.count > limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  // Bound map size
  if (map.size > 20_000) {
    for (const [k, v] of map) {
      if (now >= v.resetAt) map.delete(k);
      if (map.size < 10_000) break;
    }
  }
  return { ok: true };
}

export function rateLimitResponse(retryAfterSec: number) {
  return Response.json(
    { error: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  );
}
