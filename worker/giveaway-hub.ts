import { DurableObject } from "cloudflare:workers";
import type { Giveaway } from "../src/lib/discord/giveaway-types";

type Env = { WORKER_SELF_REFERENCE?: Fetcher; AOS_BRIDGE_SECRET?: string; AUTH_SECRET?: string };

const KEEP_ENDED_MS = 7 * 24 * 60 * 60 * 1000;
/** 참여할 때마다 메시지를 고치면 Discord 레이트리밋에 걸리므로 참여자 수는 이 간격으로만 다시 그린다 */
const RENDER_EVERY_MS = 15_000;

const json = (data: unknown, status = 200) => Response.json(data, { status });

/** 디스코드 이벤트(추첨) — 참여자를 들고 있다가 마감 시각에 알람으로 앱의 추첨 API 를 부른다 */
export class GiveawayHub extends DurableObject<Env> {
  private key(id: string) {
    return `g:${id}`;
  }

  private get(id: string) {
    return this.ctx.storage.get<Giveaway>(this.key(id));
  }

  async fetch(request: Request) {
    const body = (await request.json().catch(() => ({}))) as { op?: string; id?: string; [k: string]: unknown };
    const id = String(body.id ?? "");

    if (body.op === "create") {
      const g = body.giveaway as Giveaway;
      await this.ctx.storage.put(this.key(g.id), g);
      await this.schedule();
      return json(g);
    }

    const g = id ? await this.get(id) : undefined;
    if (!g) return json({ error: "not_found" }, 404);

    if (body.op === "get") return json(g);

    if (body.op === "attach") {
      g.messageId = String(body.messageId ?? "") || null;
      await this.ctx.storage.put(this.key(id), g);
      return json(g);
    }

    if (body.op === "join") {
      const userId = String(body.userId ?? "");
      if (g.ended || Date.now() >= g.endsAt) return json({ ended: true, count: g.entrants.length, giveaway: g });
      const at = g.entrants.indexOf(userId);
      const joined = at < 0;
      if (joined) g.entrants.push(userId);
      else g.entrants.splice(at, 1);
      const refresh = Date.now() - g.renderedAt > RENDER_EVERY_MS;
      if (refresh) g.renderedAt = Date.now();
      await this.ctx.storage.put(this.key(id), g);
      return json({ ended: false, joined, refresh, count: g.entrants.length, giveaway: g });
    }

    if (body.op === "finish") {
      if (g.ended) return json({ already: true, giveaway: g });
      g.ended = true;
      g.winnerIds = Array.isArray(body.winnerIds) ? body.winnerIds.map(String) : [];
      g.renderedAt = Date.now();
      await this.ctx.storage.put(this.key(id), g);
      await this.schedule();
      return json({ already: false, giveaway: g });
    }

    return json({ error: "bad_op" }, 400);
  }

  private async schedule() {
    const all = await this.ctx.storage.list<Giveaway>({ prefix: "g:" });
    const pending = [...all.values()].filter((g) => !g.ended).map((g) => g.endsAt);
    if (!pending.length) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.max(Math.min(...pending), Date.now() + 1000));
  }

  async alarm() {
    const now = Date.now();
    const all = await this.ctx.storage.list<Giveaway>({ prefix: "g:" });
    let failed = false;
    for (const g of all.values()) {
      if (g.ended && now - g.endsAt > KEEP_ENDED_MS) {
        await this.ctx.storage.delete(this.key(g.id));
        continue;
      }
      if (!g.ended && g.endsAt <= now && !(await this.requestEnd(g.id))) failed = true;
    }
    if (failed) await this.ctx.storage.setAlarm(now + 60_000);
    else await this.schedule();
  }

  private async requestEnd(id: string) {
    const secret = (this.env.AOS_BRIDGE_SECRET || this.env.AUTH_SECRET || "").trim();
    const req = new Request("https://vendix.team/api/discord/giveaway/end", {
      method: "POST",
      headers: { "content-type": "application/json", "x-vendix-bridge-secret": secret },
      body: JSON.stringify({ id }),
    });
    try {
      const res = await (this.env.WORKER_SELF_REFERENCE?.fetch(req) ?? fetch(req));
      console.log("giveaway end", id, res.status);
      return res.ok;
    } catch (err) {
      console.log("giveaway end failed", id, String(err));
      return false;
    }
  }
}
