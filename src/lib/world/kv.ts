import { getKvBinding } from "@/lib/db-persist";

type KvWithTtl = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
};

const memory = new Map<string, { value: string; expires: number }>();

export async function kvGetJson<T>(key: string): Promise<T | null> {
  const kv = (await getKvBinding()) as KvWithTtl | null;
  let raw: string | null;
  if (kv) raw = await kv.get(key);
  else {
    const hit = memory.get(key);
    raw = hit && hit.expires > Date.now() ? hit.value : null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function kvPutJson(key: string, value: unknown, ttlSeconds?: number) {
  const kv = (await getKvBinding()) as KvWithTtl | null;
  const raw = JSON.stringify(value);
  if (kv) await kv.put(key, raw, ttlSeconds ? { expirationTtl: Math.max(60, Math.floor(ttlSeconds)) } : undefined);
  else memory.set(key, { value: raw, expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : Number.MAX_SAFE_INTEGER });
}

/** 같은 isolate 안에서 한 사용자의 요청을 한 줄로 세운다 (토큰 이중 사용 방지) */
const chains = new Map<string, Promise<unknown>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  chains.set(key, next);
  void next.finally(() => {
    if (chains.get(key) === next) chains.delete(key);
  });
  return next;
}
