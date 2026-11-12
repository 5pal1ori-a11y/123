function cleanSecret(value: string | undefined | null) {
  return (value ?? "").replace(/^\uFEFF/, "").trim();
}

function cleanPublicKey(value: string | undefined | null) {
  return cleanSecret(value).replace(/\s+/g, "");
}

export function manageDiscordEnv() {
  return {
    publicKey: cleanPublicKey(process.env.MANAGE_DISCORD_PUBLIC_KEY),
    applicationId: cleanSecret(process.env.MANAGE_DISCORD_APPLICATION_ID),
    botToken: cleanSecret(process.env.MANAGE_DISCORD_BOT_TOKEN),
    clientSecret: cleanSecret(process.env.MANAGE_DISCORD_CLIENT_SECRET),
  };
}

export async function manageDiscordEnvAsync() {
  const base = manageDiscordEnv();
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const e = env as Record<string, string | undefined>;
    return {
      publicKey: cleanPublicKey(e.MANAGE_DISCORD_PUBLIC_KEY || base.publicKey),
      applicationId: cleanSecret(e.MANAGE_DISCORD_APPLICATION_ID || base.applicationId),
      botToken: cleanSecret(e.MANAGE_DISCORD_BOT_TOKEN || base.botToken),
      clientSecret: cleanSecret(e.MANAGE_DISCORD_CLIENT_SECRET || base.clientSecret),
    };
  } catch {
    return base;
  }
}
