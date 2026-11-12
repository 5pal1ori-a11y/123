/** Verify Discord interaction signatures (Ed25519). */

import { verifyAsync } from "@noble/ed25519";

function cleanSecret(value: string | undefined | null) {
  return (value ?? "").replace(/^\uFEFF/, "").trim();
}

/** Discord public keys are hex — strip all whitespace/newlines from secret paste. */
export function cleanDiscordPublicKey(value: string | undefined | null) {
  return cleanSecret(value).replace(/\s+/g, "");
}

function hexToBytes(hex: string) {
  const clean = cleanDiscordPublicKey(hex);
  if (!clean || clean.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
}

const ED25519_SPKI_PREFIX = Uint8Array.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

async function verifyWithNodeCrypto(
  keyBytes: Uint8Array,
  sigBytes: Uint8Array,
  message: Uint8Array,
): Promise<boolean> {
  const { createPublicKey, verify } = await import("crypto");
  const spki = new Uint8Array(ED25519_SPKI_PREFIX.length + keyBytes.length);
  spki.set(ED25519_SPKI_PREFIX, 0);
  spki.set(keyBytes, ED25519_SPKI_PREFIX.length);
  const key = createPublicKey({ key: Buffer.from(spki), format: "der", type: "spki" });
  return verify(null, Buffer.from(message), key, Buffer.from(sigBytes));
}

export async function verifyDiscordRequest(
  publicKeyHex: string,
  signature: string | null,
  timestamp: string | null,
  body: string,
): Promise<boolean> {
  if (!signature || !timestamp || !publicKeyHex) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const keyBytes = hexToBytes(publicKeyHex);
  const sigBytes = hexToBytes(signature);
  if (!keyBytes || !sigBytes || keyBytes.length !== 32 || sigBytes.length !== 64) return false;

  const message = new TextEncoder().encode(timestamp + body);

  try {
    if (await verifyAsync(sigBytes, message, keyBytes)) return true;
  } catch {
    /* try node fallback */
  }

  try {
    return await verifyWithNodeCrypto(keyBytes, sigBytes, message);
  } catch {
    return false;
  }
}

export function discordEnv() {
  return {
    publicKey: cleanDiscordPublicKey(process.env.DISCORD_PUBLIC_KEY),
    applicationId: cleanSecret(process.env.DISCORD_APPLICATION_ID),
    botToken: cleanSecret(process.env.DISCORD_BOT_TOKEN),
    clientSecret: cleanSecret(process.env.DISCORD_CLIENT_SECRET),
  };
}

export async function discordEnvAsync() {
  const base = discordEnv();
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const e = env as Record<string, string | undefined>;
    return {
      publicKey: cleanDiscordPublicKey(e.DISCORD_PUBLIC_KEY || base.publicKey),
      applicationId: cleanSecret(e.DISCORD_APPLICATION_ID || base.applicationId),
      botToken: cleanSecret(e.DISCORD_BOT_TOKEN || base.botToken),
      clientSecret: cleanSecret(e.DISCORD_CLIENT_SECRET || base.clientSecret),
    };
  } catch {
    return base;
  }
}
