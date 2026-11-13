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
    // 패널이 없어도 항상 붙어 있는다 — DOES 봇이 디스코드에서 계속 '온라인' 으로 보이게
    return NextResponse.json({
      token: (await doesDiscordEnvAsync()).botToken,
      guildId: settings.discordGuildId || MFA_DISCORD_GUILD_ID,
      userIds: [settings.serverStatusUserId || DEFAULT_STATUS_USER_ID],
    });
  }
  return NextResponse.json(await applyPresence(shop.id, parsed.data.userId, parsed.data.status));
}
