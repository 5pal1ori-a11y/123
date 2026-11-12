import { DurableObject } from "cloudflare:workers";

type Env = { WORKER_SELF_REFERENCE?: Fetcher; AOS_BRIDGE_SECRET?: string; AUTH_SECRET?: string };

type Config = { token: string; channels: string[]; syncedAt: number };

type MessageEvent = { guildId: string; channelId: string; messageId: string; authorId: string; content: string };

const GATEWAY = "https://gateway.discord.gg/?v=10&encoding=json";
/** GUILD_MESSAGES | MESSAGE_CONTENT */
const INTENTS = (1 << 9) | (1 << 15);
const ALARM_MS = 30_000;
/** cron 이 이 시간 동안 다시 등록하지 않으면 연결을 닫는다 */
const ORPHAN_MS = 20 * 60_000;
const REFUSED_BACKOFF_MS = 10 * 60_000;
/** 4004 토큰 거절 · 4013/4014 인텐트 거절 — 다시 붙어도 같은 결과라 잠시 쉰다 */
const FATAL_CLOSE = new Set([4004, 4010, 4011, 4012, 4013, 4014]);

/** DOES 봇으로 Discord 게이트웨이에 붙어 있다가, AI 가 켜진 티켓 채널의 메시지를 /api/discord/ticket-ai 로 넘긴다 */
export class TicketGateway extends DurableObject<Env> {
  private ws: WebSocket | null = null;
  private config: Config | null = null;
  private channels = new Set<string>();
  private seq: number | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private heartbeatMs = 41_250;
  private lastAck = 0;
  private connecting = false;
  private refusedUntil = 0;
  /** 같은 채널은 한 번에 하나씩 — 답하는 동안 들어온 메시지는 마지막 것만 이어서 넘긴다 */
  private busy = new Set<string>();
  private queued = new Map<string, MessageEvent>();

  async fetch(request: Request) {
    const body = (await request.json().catch(() => ({}))) as Partial<Config> & { stop?: boolean };
    const channels = Array.isArray(body.channels) ? body.channels.map(String) : [];
    if (body.stop || !channels.length) {
      await this.shutdown();
      return Response.json({ ok: true, stopped: true });
    }
    const token = (body.token ?? "").trim();
    if (token.length < 20) return Response.json({ ok: false }, { status: 400 });

    const prev = this.config ?? (await this.ctx.storage.get<Config>("config")) ?? null;
    this.config = { token, channels, syncedAt: Date.now() };
    this.channels = new Set(channels);
    await this.ctx.storage.put("config", this.config);
    if (prev && prev.token !== token) {
      this.close();
      this.refusedUntil = 0;
    }
    await this.ensureConnected();
    await this.ctx.storage.setAlarm(Date.now() + ALARM_MS);
    return Response.json({ ok: true, connected: !!this.ws, channels: channels.length });
  }

  async alarm() {
    this.config ??= (await this.ctx.storage.get<Config>("config")) ?? null;
    if (!this.config) return;
    if (Date.now() - this.config.syncedAt > ORPHAN_MS || !this.config.channels.length) {
      await this.shutdown();
      return;
    }
    this.channels = new Set(this.config.channels);
    await this.ensureConnected();
    await this.ctx.storage.setAlarm(Date.now() + ALARM_MS);
  }

  private async shutdown() {
    this.close();
    this.config = null;
    this.channels.clear();
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
        console.log("ticket gateway refused", res.status);
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
          console.log("ticket gateway closed (fatal)", ev.code, ev.reason);
        } else {
          console.log("ticket gateway closed", ev.code);
        }
      });
      ws.addEventListener("error", () => {
        if (this.ws === ws) this.close();
      });
    } catch (err) {
      console.log("ticket gateway connect failed", String(err));
    } finally {
      this.connecting = false;
    }
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
          properties: { os: "linux", browser: "does-ticket-ai", device: "does-ticket-ai" },
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
    if (frame.op === 0 && frame.t === "READY") {
      console.log("ticket gateway ready", this.channels.size);
      return;
    }
    if (frame.op !== 0 || frame.t !== "MESSAGE_CREATE") return;

    const d = frame.d as {
      id?: string;
      channel_id?: string;
      guild_id?: string;
      content?: string;
      author?: { id?: string; bot?: boolean };
      webhook_id?: string;
    };
    if (!d?.channel_id || !this.channels.has(d.channel_id) || !d.guild_id || !d.id) return;
    if (d.author?.bot || d.webhook_id || !d.author?.id) return;
    this.enqueue({
      guildId: d.guild_id,
      channelId: d.channel_id,
      messageId: d.id,
      authorId: d.author.id,
      content: d.content ?? "",
    });
  }

  private enqueue(event: MessageEvent) {
    if (this.busy.has(event.channelId)) {
      this.queued.set(event.channelId, event);
      return;
    }
    this.busy.add(event.channelId);
    this.ctx.waitUntil(this.drain(event));
  }

  private async drain(first: MessageEvent) {
    let event: MessageEvent | undefined = first;
    try {
      while (event) {
        await this.forward(event);
        event = this.queued.get(first.channelId);
        this.queued.delete(first.channelId);
      }
    } finally {
      this.busy.delete(first.channelId);
    }
  }

  private async forward(event: MessageEvent) {
    const secret = (this.env.AOS_BRIDGE_SECRET || this.env.AUTH_SECRET || "").trim();
    const req = new Request("https://vendix.team/api/discord/ticket-ai", {
      method: "POST",
      headers: { "content-type": "application/json", "x-vendix-bridge-secret": secret },
      body: JSON.stringify({ op: "message", ...event }),
    });
    try {
      const res = await (this.env.WORKER_SELF_REFERENCE?.fetch(req) ?? fetch(req));
      const data = (await res.json().catch(() => null)) as { channels?: string[] } | null;
      if (res.ok && Array.isArray(data?.channels) && this.config) {
        this.config.channels = data.channels.map(String);
        this.channels = new Set(this.config.channels);
        await this.ctx.storage.put("config", this.config);
      }
      console.log("ticket ai forward", res.status);
    } catch (err) {
      console.log("ticket ai forward failed", String(err));
    }
  }
}
