import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { initStore, listPushbulletBridgeShops } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clean(v: string | undefined | null) {
  return (v ?? "").replace(/^\uFEFF/, "").trim();
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

async function bridgeSecretExpected() {
  let expected = clean(process.env.AOS_BRIDGE_SECRET) || clean(process.env.AUTH_SECRET);
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const e = env as Record<string, string | undefined>;
    expected =
      clean(e.AOS_BRIDGE_SECRET) ||
      clean(e.AUTH_SECRET) ||
      expected;
  } catch {
    /* local */
  }
  return expected;
}

function extractSecret(request: Request) {
  const header = clean(request.headers.get("x-vendix-bridge-secret"));
  if (header) return header;
  const auth = request.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return clean(auth.slice(7));
  return clean(new URL(request.url).searchParams.get("secret"));
}

/** Pushbullet AOS bridge — poll for shops that saved a token */
export async function GET(request: Request) {
  const expected = await bridgeSecretExpected();
  const provided = extractSecret(request);
  if (!expected || expected.length < 8 || !provided || !safeEqual(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await initStore({ force: true });
  const shops = listPushbulletBridgeShops();
  return NextResponse.json({
    ok: true,
    count: shops.length,
    shops,
    polledAt: new Date().toISOString(),
  });
}
