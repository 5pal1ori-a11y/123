export function securityDiscordEnv() {
  return {
    publicKey: process.env.SECURITY_DISCORD_PUBLIC_KEY?.trim() ?? "",
    applicationId: process.env.SECURITY_DISCORD_APPLICATION_ID?.trim() ?? "",
    botToken: process.env.SECURITY_DISCORD_BOT_TOKEN?.trim() ?? "",
    clientSecret: process.env.SECURITY_DISCORD_CLIENT_SECRET?.trim() ?? "",
  };
}

export async function securityDiscordEnvAsync() {
  const base = securityDiscordEnv();
  if (base.publicKey && base.applicationId && base.botToken && base.clientSecret) return base;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const e = env as Record<string, string | undefined>;
    return {
      publicKey: (e.SECURITY_DISCORD_PUBLIC_KEY ?? base.publicKey).trim(),
      applicationId: (e.SECURITY_DISCORD_APPLICATION_ID ?? base.applicationId).trim(),
      botToken: (e.SECURITY_DISCORD_BOT_TOKEN ?? base.botToken).trim(),
      clientSecret: (e.SECURITY_DISCORD_CLIENT_SECRET ?? base.clientSecret).trim(),
    };
  } catch {
    return base;
  }
}
