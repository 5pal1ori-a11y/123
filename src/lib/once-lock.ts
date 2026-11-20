/**
 * 인스턴스 간 "딱 한 번" 선점 — 같은 입금 알림이 APK·Pushbullet 으로 동시에 들어와
 * 서로 다른 Worker 가 각자 처리해도 후처리(로그·DM)는 한 번만 나가게 한다.
 * DO(ONCE_LOCK) 가 없으면 KV 로 최선을 다한다 (완벽하진 않음).
 */
type DoNs = { idFromName(name: string): unknown; get(id: unknown): { fetch(url: string, init?: RequestInit): Promise<Response> } };

export async function claimOnce(key: string, ttlMs = 600_000): Promise<boolean> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const ns = (env as { ONCE_LOCK?: DoNs }).ONCE_LOCK;
    if (ns) {
      const res = await ns.get(ns.idFromName("once")).fetch("https://once-lock/", {
        method: "POST",
        body: JSON.stringify({ key, ttlMs }),
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      return Boolean(j?.ok);
    }
  } catch {
    /* DO 실패 → KV 로 */
  }
  try {
    const { kvGetRaw, kvPutRaw } = await import("@/lib/world/kv");
    const k = `once:${key}`;
    if (await kvGetRaw(k)) return false;
    await kvPutRaw(k, "1", Math.ceil(ttlMs / 1000));
    return true;
  } catch {
    return true;
  }
}
