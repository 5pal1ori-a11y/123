import { cleanDiscordPublicKey } from "@/lib/discord/verify";

export const DOES_APPLICATION_ID = "1540972072963149944";
export const DOES_PUBLIC_KEY = "181a3949646085b262718c2f98a1f5caef585c1af9aeb9f39ae3f0c31cc2d285";

function cleanSecret(value: string | undefined | null) {
  return (value ?? "").replace(/^\uFEFF/, "").trim();
}

export function isMfaShopSlug(slug?: string | null) {
  return (slug ?? "").trim().toLowerCase() === "mfa";
}

export const DISCORD_LINK_REQUIRED = "디스코드를 연동해야 상품을 구매할 수 있어요. 내 정보 → Discord 연동을 눌러주세요.";

/** DOES 봇 자격 — 플랫폼 DOES applicationId/secret 을 섞지 않는다. */
export async function doesDiscordEnvAsync() {
  let fromCf = {
    publicKey: DOES_PUBLIC_KEY,
    applicationId: DOES_APPLICATION_ID,
    botToken: "",
    clientSecret: cleanSecret(process.env.VERIFY_DISCORD_CLIENT_SECRET),
  };
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const e = env as Record<string, string | undefined>;
    fromCf = {
      publicKey: cleanDiscordPublicKey(e.VERIFY_DISCORD_PUBLIC_KEY) || DOES_PUBLIC_KEY,
      applicationId: cleanSecret(e.VERIFY_DISCORD_APPLICATION_ID) || DOES_APPLICATION_ID,
      botToken: cleanSecret(e.VERIFY_DISCORD_BOT_TOKEN),
      clientSecret: cleanSecret(e.VERIFY_DISCORD_CLIENT_SECRET),
    };
  } catch {
    /* local / missing CF */
  }

  let shopToken = "";
  try {
    const { getShopBySlug, getShopSettings, MFA_SHOP_SLUG } = await import("@/lib/store");
    const row = getShopBySlug(MFA_SHOP_SLUG);
    if (row) {
      shopToken = getShopSettings(row.id).discordBotToken?.trim() || "";
    }
  } catch {
    /* store not ready */
  }

  return {
    publicKey: fromCf.publicKey || DOES_PUBLIC_KEY,
    applicationId: DOES_APPLICATION_ID,
    botToken: shopToken || fromCf.botToken,
    clientSecret: fromCf.clientSecret,
  };
}
