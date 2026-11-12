import { doesDiscordEnvAsync } from "@/lib/discord/does-env";
import { cleanDiscordPublicKey } from "@/lib/discord/verify";

function cleanSecret(value: string | undefined | null) {
  return (value ?? "").replace(/^\uFEFF/, "").trim();
}

export function verifyDiscordEnv() {
  return {
    publicKey: cleanDiscordPublicKey(process.env.VERIFY_DISCORD_PUBLIC_KEY),
    applicationId: cleanSecret(process.env.VERIFY_DISCORD_APPLICATION_ID),
    botToken: cleanSecret(process.env.VERIFY_DISCORD_BOT_TOKEN),
    clientSecret: cleanSecret(process.env.VERIFY_DISCORD_CLIENT_SECRET),
  };
}

export async function verifyDiscordEnvAsync() {
  return doesDiscordEnvAsync();
}
