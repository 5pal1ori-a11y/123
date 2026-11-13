import { DurableObject } from "cloudflare:workers";

type Env = { WORKER_SELF_REFERENCE?: Fetcher; AOS_BRIDGE_SECRET?: string; AUTH_SECRET?: string };
type Config = { token: string; guildId: string; userIds: string[]; syncedAt: number };
type Status = "online" | "idle" | "dnd" | "offline";

const GATEWAY = "https://gateway.discord.gg/?v=10&encoding=json";
/** GUILDS | GUILD_PRESENCES (Developer Portal 에서 Presence Intent 를 켜야 한다) */
const INTENTS = (1 << 0) | (1 << 8);
const ALARM_MS = 30_000;
/** 이 주기로 대상의 현재 상태를 다시 물어본다 (이벤트를 놓쳐도 맞춰진다) */
const RESYNC_MS = 5 * 60_000;
const ORPHAN_MS = 20 * 60_000;
const REFUSED_BACKOFF_MS = 10 * 60_000;
const FATAL_CLOSE = new Set([4004, 4010, 4011, 4012, 4013, 4014]);

/** 관리자 온라인 여부를 디스코드 게이트웨이로 지켜보다가, 바뀌면 /api/discord/server-status 로 알린다 */
export class StatusWatch extends DurableObject<Env> {
  private ws: WebSocket | null = null;
  private config: Config | null = null;
  private seq: number | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private heartbeatMs = 41_250;
  private lastAck = 0;
  private connecting = false;
  private refusedUntil = 0;
  private lastResync = 0;
  private statuses = new Map<string, Status>();

  async fetch(request: Request) {
    const body = (await request.json().catch(() => ({}))) as Partial<Config> & { stop?: boolean };
    const token = (body.token ?? "").trim();
    const userIds = Array.isArray(body.userIds) ? body.userIds.map(String).filter(Boolean) : [];
    if (body.stop || token.length < 20 || !userIds.length || !body.guildId) {
      await this.shutdown();
      return Response.json({ ok: true, stopped: true });
    }
    const prev = this.config ?? (await this.ctx.storage.get<Config>("config")) ?? null;
    this.config = { token, guildId: String(body.guildId), userIds, syncedAt: Date.now() };
    await this.ctx.storage.put("config", this.config);
    if (prev && (prev.token !== token || prev.guildId !== this.config.guildId)) {
      this.close();
      this.refusedUntil = 0;
    } else if (prev && prev.userIds.join() !== userIds.join()) {
      this.statuses.clear();
      this.requestPresences();
    }
    await this.ensureConnected();
    await this.ctx.storage.setAlarm(Date.now() + ALARM_MS);
    return Response.json({ ok: true, connected: !!this.ws, refused: Date.now() < this.refusedUntil });
  }

  async alarm() {
    this.config ??= (await this.ctx.storage.get<Config>("config")) ?? null;
    if (!this.config) return;
    if (Date.now() - this.config.syncedAt > ORPHAN_MS) {
      await this.shutdown();
      return;
    }
    await this.ensureConnected();
    if (this.ws && Date.now() - this.lastResync > RESYNC_MS) this.requestPresences();
    await this.ctx.storage.setAlarm(Date.now() + ALARM_MS);
  }

  private async shutdown() {
    this.close();
    this.config = null;
    this.statuses.clear();
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  private close() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close(1000, "bye");
    } catch {
      /* already closed */
    }
  }

  private send(payload: unknown) {
    try {
      this.ws?.send(JSON.stringify(payload));
    } catch {
      this.close();
    }
  }

  private stale() {
    return Date.now() - this.lastAck > this.heartbeatMs * 2 + 5_000;
  }

  private async ensureConnected() {
    if (this.ws && !this.stale()) return;
    if (this.connecting || !this.config || Date.now() < this.refusedUntil) return;
    this.close();
    this.connecting = true;
    try {
      const res = await fetch(GATEWAY, { headers: { Upgrade: "websocket" } });
      const ws = res.webSocket;
      if (!ws) {
        console.log("status watch refused", res.status);
        return;
      }
      ws.accept();
      this.ws = ws;
      this.seq = null;
      this.lastAck = Date.now();
      ws.addEventListener("message", (ev) => {
        if (typeof ev.data === "string") this.onFrame(ev.data);
      });
      ws.addEventListener("close", (ev) => {
        if (this.ws !== ws) return;
        this.close();
        if (FATAL_CLOSE.has(ev.code)) {
          this.refusedUntil = Date.now() + REFUSED_BACKOFF_MS;
          // 4014: Presence Intent 가 꺼져 있음
          console.log("status watch closed (fatal)", ev.code, ev.reason);
        } else {
          console.log("status watch closed", ev.code);
        }
      });
      ws.addEventListener("error", () => {
        if (this.ws === ws) this.close();
      });
    } catch (err) {
      console.log("status watch connect failed", String(err));
    } finally {
      this.connecting = false;
    }
  }

  /** 대상 사용자의 현재 상태를 요청 (GUILD_MEMBERS_CHUNK 로 돌아온다) */
  private requestPresences() {
    if (!this.ws || !this.config) return;
    this.lastResync = Date.now();
    this.send({
      op: 8,
      d: { guild_id: this.config.guildId, user_ids: this.config.userIds, presences: true, nonce: `sw${Date.now()}` },
    });
  }

  private onFrame(raw: string) {
    let frame: { op?: number; d?: unknown; s?: number | null; t?: string | null };
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof frame.s === "number") this.seq = frame.s;

    if (frame.op === 10) {
      const d = frame.d as { heartbeat_interval?: number } | undefined;
      this.heartbeatMs = d?.heartbeat_interval ?? 41_250;
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => this.send({ op: 1, d: this.seq }), this.heartbeatMs);
      this.lastAck = Date.now();
      this.send({
        op: 2,
        d: {
          token: this.config?.token ?? "",
          intents: INTENTS,
          properties: { os: "linux", browser: "does-status", device: "does-status" },
        },
      });
      return;
    }
    if (frame.op === 11) {
      this.lastAck = Date.now();
      return;
    }
    if (frame.op === 1) {
      this.send({ op: 1, d: this.seq });
      return;
    }
    if (frame.op === 7 || frame.op === 9) {
      this.close();
      this.ctx.waitUntil(new Promise((r) => setTimeout(r, 3_000)).then(() => this.ensureConnected()));
      return;
    }
    if (frame.op !== 0) return;

    if (frame.t === "READY") {
      this.requestPresences();
      return;
    }
    if (frame.t === "GUILD_MEMBERS_CHUNK") {
      const d = frame.d as {
        guild_id?: string;
        presences?: { user?: { id?: string }; status?: string }[];
        members?: { user?: { id?: string } }[];
      };
      if (!this.config || d.guild_id !== this.config.guildId) return;
      const seen = new Map<string, Status>();
      for (const p of d.presences ?? []) if (p.user?.id) seen.set(p.user.id, toStatus(p.status));
      // 멤버로는 왔는데 presence 가 없으면 오프라인
      for (const m of d.members ?? []) if (m.user?.id && !seen.has(m.user.id)) seen.set(m.user.id, "offline");
      for (const [id, st] of seen) this.update(id, st);
      return;
    }
    if (frame.t === "PRESENCE_UPDATE") {
      const d = frame.d as { guild_id?: string; user?: { id?: string }; status?: string };
      if (!this.config || d.guild_id !== this.config.guildId || !d.user?.id) return;
      this.update(d.user.id, toStatus(d.status));
    }
  }

  private update(userId: string, status: Status) {
    if (!this.config?.userIds.includes(userId)) return;
    if (this.statuses.get(userId) === status) return;
    this.statuses.set(userId, status);
    this.ctx.waitUntil(this.forward(userId, status));
  }

  private async forward(userId: string, status: Status) {
    const secret = (this.env.AOS_BRIDGE_SECRET || this.env.AUTH_SECRET || "").trim();
    const req = new Request("https://vendix.team/api/discord/server-status", {
      method: "POST",
      headers: { "content-type": "application/json", "x-vendix-bridge-secret": secret },
      body: JSON.stringify({ op: "presence", userId, status }),
    });
    try {
      const res = await (this.env.WORKER_SELF_REFERENCE?.fetch(req) ?? fetch(req));
      console.log("status watch forward", userId, status, res.status);
    } catch (err) {
      // 다음 재확인 때 다시 보내도록 기억을 지운다
      this.statuses.delete(userId);
      console.log("status watch forward failed", String(err));
    }
  }
}

function toStatus(s: string | undefined): Status {
  return s === "online" || s === "idle" || s === "dnd" ? s : "offline";
}
