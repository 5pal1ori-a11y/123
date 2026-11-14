import { NextResponse } from "next/server";
import { z } from "zod";
import { hasInternalSecret } from "@/lib/internal-secret";
import { doesDiscordEnvAsync } from "@/lib/discord/does-env";
import { applyPresence, DEFAULT_STATUS_USER_ID } from "@/lib/discord/server-status";
import { getShopBySlug, getShopSettings, initStore, MFA_DISCORD_GUILD_ID, MFA_SHOP_SLUG } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const snowflake = z.string().regex(/^\d{5,30}$/);
const bodySchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("config") }),
  z.object({ op: z.literal("presence"), userId: snowflake, status: z.enum(["online", "idle", "dnd", "offline"]) }),
]);

async function statusWatchEnabled() {
  let v = process.env.STATUS_WATCH_ENABLED ?? "";
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    v = (env as Record<string, string | undefined>).STATUS_WATCH_ENABLED ?? v;
  } catch {
    /* local */
  }
  return v.trim() === "1";
}

/** StatusWatch Durable Object 전용 (x-vendix-bridge-secret) */
export async function POST(request: Request) {
  if (!(await hasInternalSecret(request))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await initStore();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const shop = getShopBySlug(MFA_SHOP_SLUG);
  if (!shop) return NextResponse.json({ token: "", guildId: "", userIds: [] });
  const settings = getShopSettings(shop.id);

  if (parsed.data.op === "config") {
    // 게이트웨이를 계속 붙잡아 두면 Durable Object 사용 시간이 하루 약 10,800 GB-s 든다.
    // 무료 플랜(하루 13,000)에서는 자동충전(Pushbullet 브리지)까지 멈추게 되므로
    // STATUS_WATCH_ENABLED=1 (유료 플랜) 일 때만 붙는다.
    const enabled = await statusWatchEnabled();
    return NextResponse.json({
      token: enabled ? (await doesDiscordEnvAsync()).botToken : "",
      guildId: settings.discordGuildId || MFA_DISCORD_GUILD_ID,
      userIds: [settings.serverStatusUserId || DEFAULT_STATUS_USER_ID],
    });
  }
  return NextResponse.json(await applyPresence(shop.id, parsed.data.userId, parsed.data.status));
}
