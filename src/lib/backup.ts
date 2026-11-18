/**
 * 자동 백업 — 전체 DB(KV vendix:db)를 6시간마다 타임스탬프 키로 복사해 둔다.
 * 최근 12개만 남기고(각 14일 보관), 관리자 페이지에서 목록·다운로드할 수 있다.
 * 실수로 데이터가 꼬였을 때 되돌릴 안전망.
 */
import { DB_KV_KEY } from "@/lib/db-persist";
import { kvGetJson, kvGetRaw, kvPutJson, kvPutRaw, withLock } from "@/lib/world/kv";

const INDEX_KEY = "backup:index:v1";
const EVERY_MS = 6 * 60 * 60_000;
const KEEP = 12;
const TTL_SEC = 14 * 24 * 60 * 60;

export type BackupEntry = { key: string; at: string; bytes: number; users: number; orders: number; products: number };

export async function getBackupIndex(): Promise<BackupEntry[]> {
  return (await kvGetJson<BackupEntry[]>(INDEX_KEY)) ?? [];
}

export async function runBackup(force = false) {
  return withLock("backup", async () => {
    const index = await getBackupIndex();
    const last = index[0];
    if (!force && last && Date.now() - new Date(last.at).getTime() < EVERY_MS - 60_000) return { skipped: true as const };
    const raw = await kvGetRaw(DB_KV_KEY);
    if (!raw) return { skipped: true as const, reason: "no db" };
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 16);
    const bkKey = `backup:db:${stamp}`;
    await kvPutRaw(bkKey, raw, TTL_SEC);
    let users = 0, orders = 0, products = 0;
    try {
      const o = JSON.parse(raw) as { users?: unknown[]; orders?: unknown[]; products?: unknown[] };
      users = o.users?.length ?? 0;
      orders = o.orders?.length ?? 0;
      products = o.products?.length ?? 0;
    } catch { /* ignore */ }
    const entry: BackupEntry = { key: bkKey, at: now.toISOString(), bytes: raw.length, users, orders, products };
    const next = [entry, ...index].slice(0, KEEP);
    await kvPutJson(INDEX_KEY, next);
    return { skipped: false as const, entry, total: next.length };
  });
}

export async function getBackupRaw(key: string) {
  if (!/^backup:db:[0-9TZ-]{10,40}$/.test(key)) return null;
  return kvGetRaw(key);
}
