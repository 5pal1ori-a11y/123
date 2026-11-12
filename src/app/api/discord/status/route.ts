import { NextResponse } from "next/server";
import { discordRest } from "@/lib/discord/rest";
import { discordEnvAsync } from "@/lib/discord/verify";

export const dynamic = "force-dynamic";

/** Public health: proves platform Discord bot token works (no secrets returned). */
export async function GET() {
  const env = await discordEnvAsync();
  if (!env.botToken) {
    return NextResponse.json({ ok: false, error: "bot token not configured on worker" }, { status: 503 });
  }
  const me = await discordRest("GET", "/users/@me");
  if (!me.ok) {
    return NextResponse.json(
      { ok: false, error: "discord api failed", status: me.status },
      { status: 502 },
    );
  }
  const user = me.json as { id?: string; username?: string; bot?: boolean };
  return NextResponse.json({
    ok: true,
    bot: true,
    id: user.id ?? null,
    username: user.username ?? null,
    interactionsUrl: "https://vendix.team/api/discord/interactions",
    note: "Slash commands are handled by Workers. Gateway presence is optional.",
  });
}
