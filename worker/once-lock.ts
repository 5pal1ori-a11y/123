import { DurableObject } from "cloudflare:workers";

/**
 * 여러 Worker 인스턴스가 같은 일을 동시에 할 때 딱 한 번만 하게 하는 잠금.
 * DO 인스턴스 하나는 요청을 하나씩 처리하므로 "처음 온 요청만 ok" 가 보장된다.
 * POST { key, ttlMs } → { ok: true } (처음) / { ok: false } (ttl 안에 이미 선점됨)
 */
export class OnceLock extends DurableObject {
  async fetch(request: Request) {
    const body = (await request.json().catch(() => ({}))) as { key?: string; ttlMs?: number };
    const key = String(body.key ?? "").slice(0, 200);
    if (!key) return Response.json({ ok: false, error: "key" }, { status: 400 });
    const ttl = Math.min(Math.max(Number(body.ttlMs) || 600_000, 10_000), 7 * 86_400_000);
    const now = Date.now();
    const prev = await this.ctx.storage.get<number>(key);
    if (prev && prev > now) return Response.json({ ok: false });
    await this.ctx.storage.put(key, now + ttl);
    // 만료된 키 정리는 알람으로 가끔
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(now + 3_600_000);
    return Response.json({ ok: true });
  }

  async alarm() {
    const now = Date.now();
    const all = await this.ctx.storage.list<number>({ limit: 1000 });
    const dead: string[] = [];
    for (const [k, exp] of all) if (typeof exp === "number" && exp <= now) dead.push(k);
    if (dead.length) await this.ctx.storage.delete(dead);
    if (all.size > dead.length) await this.ctx.storage.setAlarm(now + 3_600_000);
  }
}
