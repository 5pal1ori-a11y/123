import { NextResponse } from "next/server";
import { clearManageGlobalCommands, manageBotRest, registerManageGuildCommands } from "@/lib/manage-bot/rest";
import { MANAGE_DISCORD_COMMANDS } from "@/lib/manage-bot/commands";
import { initManageStore, listAllManageGuilds } from "@/lib/manage-bot/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(request: Request) {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token === secret;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cleared = await clearManageGlobalCommands();
  if (!cleared.ok) {
    return NextResponse.json({ error: cleared.error || "global clear failed" }, { status: 502 });
  }

  await initManageStore({ force: true });
  const fromStore = listAllManageGuilds().map((g) => g.guildId);
  const listed = await manageBotRest("GET", "/users/@me/guilds?limit=200");
  const fromBot = Array.isArray(listed.json)
    ? (listed.json as { id?: string }[]).map((g) => String(g.id || "")).filter(Boolean)
    : [];
  const guildIds = [...new Set([...fromStore, ...fromBot])];

  const guilds: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of guildIds) {
    const res = await registerManageGuildCommands(id);
    guilds.push({ id, ok: res.ok, error: res.ok ? undefined : res.error });
  }

  return NextResponse.json({
    ok: true,
    commands: MANAGE_DISCORD_COMMANDS.map((c) => c.name),
    globalCleared: true,
    guilds,
  });
}
