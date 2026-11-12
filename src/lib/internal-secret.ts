import { timingSafeEqual } from "crypto";

function clean(v: string | undefined | null) {
  return (v ?? "").replace(/^\uFEFF/, "").trim();
}

async function expectedSecret() {
  let expected = clean(process.env.AOS_BRIDGE_SECRET) || clean(process.env.AUTH_SECRET);
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const e = env as Record<string, string | undefined>;
    expected = clean(e.AOS_BRIDGE_SECRET) || clean(e.AUTH_SECRET) || expected;
  } catch {
    /* local */
  }
  return expected;
}

/** 워커 cron·Durable Object 가 앱 내부 API 를 부를 때 쓰는 공유 시크릿(x-vendix-bridge-secret) 확인 */
export async function hasInternalSecret(request: Request) {
  const expected = await expectedSecret();
  const got = clean(request.headers.get("x-vendix-bridge-secret"));
  if (expected.length < 8 || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
