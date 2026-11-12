export function ticketDiscordEnv() {
  return {
    publicKey: process.env.TICKET_DISCORD_PUBLIC_KEY?.trim() ?? "",
    applicationId: process.env.TICKET_DISCORD_APPLICATION_ID?.trim() ?? "",
    botToken: process.env.TICKET_DISCORD_BOT_TOKEN?.trim() ?? "",
    clientSecret: process.env.TICKET_DISCORD_CLIENT_SECRET?.trim() ?? "",
  };
}

export async function ticketDiscordEnvAsync() {
  const base = ticketDiscordEnv();
  if (base.publicKey && base.applicationId && base.botToken && base.clientSecret) return base;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const e = env as Record<string, string | undefined>;
    return {
      publicKey: (e.TICKET_DISCORD_PUBLIC_KEY ?? base.publicKey).trim(),
      applicationId: (e.TICKET_DISCORD_APPLICATION_ID ?? base.applicationId).trim(),
      botToken: (e.TICKET_DISCORD_BOT_TOKEN ?? base.botToken).trim(),
      clientSecret: (e.TICKET_DISCORD_CLIENT_SECRET ?? base.clientSecret).trim(),
    };
  } catch {
    return base;
  }
}
