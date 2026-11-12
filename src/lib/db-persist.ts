type KvBinding = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

export const DB_KV_KEY = "vendix:db";

export async function getKvBinding(): Promise<KvBinding | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const kv = (env as { VENDIX_KV?: KvBinding }).VENDIX_KV;
    return kv ?? null;
  } catch {
    return null;
  }
}

export async function loadDbJsonFromKv(): Promise<string | null> {
  const kv = await getKvBinding();
  if (!kv) return null;
  return kv.get(DB_KV_KEY);
}

export async function saveDbJsonToKv(json: string): Promise<boolean> {
  try {
    const kv = await getKvBinding();
    if (!kv) return false;
    await kv.put(DB_KV_KEY, json);
    return true;
  } catch (err) {
    console.error("[vendix] KV put failed", err);
    return false;
  }
}

/** Workers는 응답을 보낸 뒤 기다리지 않은 작업을 끊을 수 있어서 waitUntil에 걸어 둔다 */
export function keepAlive(pending: Promise<unknown>) {
  void import("@opennextjs/cloudflare")
    .then(({ getCloudflareContext }) => {
      try {
        getCloudflareContext().ctx.waitUntil(pending);
      } catch {
        /* local / outside request */
      }
    })
    .catch(() => {});
}

/** Read-after-write check that discord link code survived KV put */
export async function verifyLinkCodeInKv(shopId: string, code: string): Promise<boolean> {
  const raw = await loadDbJsonFromKv();
  if (!raw) return false;
  try {
    const db = JSON.parse(raw) as { discordLinkCodes?: { shopId: string; code: string; expiresAt: string }[] };
    const list = Array.isArray(db.discordLinkCodes) ? db.discordLinkCodes : [];
    const now = Date.now();
    return list.some(
      (c) =>
        c.shopId === shopId &&
        c.code === code &&
        new Date(c.expiresAt).getTime() > now,
    );
  } catch {
    return false;
  }
}
