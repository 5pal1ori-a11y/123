/** 외부 API 키 (하이픽셀 · 도넛SMP) — 관리자 대시보드에서 넣으면 KV 에 저장, 없으면 환경변수 */
import { kvGetJson, kvPutJson } from "@/lib/world/kv";

export type ApiKeyName = "hypixel" | "donut";
type Saved = { key: string; updatedAt: string };

const kvKey = (name: ApiKeyName) => `cfg:api-key:${name}`;
const ENV: Record<ApiKeyName, string> = { hypixel: "HYPIXEL_API_KEY", donut: "DONUT_API_KEY" };

let cache: Partial<Record<ApiKeyName, { v: string; at: number }>> = {};

export async function getApiKey(name: ApiKeyName): Promise<string> {
  const c = cache[name];
  if (c && Date.now() - c.at < 30_000) return c.v;
  let v = "";
  try {
    v = (await kvGetJson<Saved>(kvKey(name)))?.key?.trim() ?? "";
  } catch {
    /* kv 없음 */
  }
  if (!v) {
    try {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      const { env } = await getCloudflareContext({ async: true });
      v = ((env as Record<string, string | undefined>)[ENV[name]] ?? "").trim();
    } catch {
      /* local */
    }
    v ||= process.env[ENV[name]]?.trim() || "";
  }
  cache[name] = { v, at: Date.now() };
  return v;
}

export async function getApiKeyMeta(name: ApiKeyName) {
  const saved = await kvGetJson<Saved>(kvKey(name)).catch(() => null);
  const key = await getApiKey(name);
  return {
    set: Boolean(key),
    source: saved?.key ? "dashboard" : key ? "env" : null,
    masked: key ? `${key.slice(0, 4)}••••${key.slice(-4)}` : null,
    updatedAt: saved?.updatedAt ?? null,
  };
}

export async function setApiKey(name: ApiKeyName, key: string) {
  await kvPutJson(kvKey(name), { key: key.trim(), updatedAt: new Date().toISOString() });
  cache = {};
}

/** 하이픽셀 키가 살아 있는지 확인 (punishmentstats 는 키가 필요하다) */
export async function testHypixelKey(key: string) {
  try {
    const res = await fetch("https://api.hypixel.net/v2/punishmentstats", { headers: { "API-Key": key }, signal: AbortSignal.timeout(8000) });
    const data = (await res.json().catch(() => null)) as { success?: boolean; cause?: string } | null;
    return { ok: res.ok && data?.success !== false, message: data?.cause ?? (res.ok ? "정상" : `HTTP ${res.status}`) };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "확인 실패" };
  }
}
