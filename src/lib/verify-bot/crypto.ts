import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function secretCandidates() {
  const list = [
    process.env.VERIFY_TOKEN_SECRET?.trim(),
    process.env.VERIFY_DISCORD_CLIENT_SECRET?.trim(),
    process.env.AUTH_SECRET?.trim(),
    "vendix-dev-secret-change-me",
  ].filter(Boolean) as string[];
  return [...new Set(list)];
}

function keyBytes(secret: string) {
  return createHash("sha256").update(`vb-token:${secret}`).digest();
}

/** Encrypt refresh token for at-rest storage. */
export function encryptSecret(plain: string): string {
  const secret = secretCandidates()[0]!;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(secret), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptSecret(blob: string): string | null {
  const buf = Buffer.from(blob, "base64url");
  if (buf.length < 28) return null;
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  for (const secret of secretCandidates()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", keyBytes(secret), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    } catch {
      /* try next key */
    }
  }
  return null;
}

export function hashRecoveryKey(key: string) {
  return createHash("sha256").update(`vb-rk:${key.trim()}`).digest("hex");
}

export function generateRecoveryKey() {
  return randomBytes(12).toString("hex");
}
