import { NextResponse } from "next/server";
import { handleDiscordInteraction } from "@/lib/discord/router";
import { initStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function forwardKey() {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const key = (env as { DOES_FORWARD_KEY?: string }).DOES_FORWARD_KEY?.trim();
    if (key) return key;
  } catch {
    /* local */
  }
  return process.env.DOES_FORWARD_KEY?.trim() || "";
}

function sameKey(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(request: Request) {
  const key = await forwardKey();
  if (!key || !sameKey(request.headers.get("x-does-forward") ?? "", key)) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const interaction = await request.json().catch(() => null);
  if (!interaction || typeof interaction !== "object") {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  await initStore({ force: true });
  return NextResponse.json(await handleDiscordInteraction(interaction));
}
