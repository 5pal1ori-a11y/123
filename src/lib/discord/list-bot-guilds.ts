export type BotGuild = {
  id: string;
  name: string;
  icon: string | null;
  iconUrl: string | null;
};

export async function listBotGuilds(botToken: string): Promise<BotGuild[]> {
  const token = botToken.trim();
  if (!token) return [];
  const res = await fetch("https://discord.com/api/v10/users/@me/guilds?limit=200", {
    headers: { authorization: `Bot ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    console.error("[bot-guilds]", res.status, await res.text().catch(() => ""));
    return [];
  }
  const rows = (await res.json()) as Array<{ id?: string; name?: string; icon?: string | null }>;
  return rows
    .filter((g) => g.id && g.name)
    .map((g) => ({
      id: String(g.id),
      name: String(g.name),
      icon: g.icon ?? null,
      iconUrl: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}
