import { DurableObject } from "cloudflare:workers";

type Env = { WORKER_SELF_REFERENCE?: Fetcher; AOS_BRIDGE_SECRET?: string; AUTH_SECRET?: string };
type Config = { token: string; guildId: string; userIds: string[]; syncedAt: number };
type Status = "online" | "idle" | "dnd" | "offline";

const GATEWAY = "https://gateway.discord.gg/?v=10&encoding=json";
const GUILDS = 1 << 0;
/** 입장 환영용 (Developer Portal 에서 Server Members Intent 를 켜야 한다) */
const GUILD_MEMBERS = 1 << 1;
/** 관리자 온라인 감시용 (Presence Intent) */
const GUILD_PRESENCES = 1 << 8;
/** 숫자 맞추기: 채널 메시지 받기 */
const GUILD_MESSAGES = 1 << 9;
/** 숫자 맞추기: 메시지 내용 읽기 (Developer Portal 에서 Message Content Intent 를 켜야 한다) */
const MESSAGE_CONTENT = 1 << 15;
const ALARM_MS = 30_000;
/** 이 주기로 대상의 현재 상태를 다시 물어본다 (이벤트를 놓쳐도 맞춰진다) */
const RESYNC_MS = 5 * 60_000;
const ORPHAN_MS = 20 * 60_000;
const REFUSED_BACKOFF_MS = 10 * 60_000;
const FATAL_CLOSE = new Set([4004, 4010, 4011, 4012, 4013, 4014]);

/**
 * DOES 봇으로 게이트웨이에 계속 붙어 있는다.
 * - 봇이 디스코드에서 항상 '온라인' 으로 보이게 한다
 * - 관리자 온라인 여부(PRESENCE_UPDATE)를 지켜보다가 바뀌면 /api/discord/server-status 로 알린다
 */
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
  private presenceDenied = false;
  /** Server Members Intent 가 꺼져 있어 4014 로 끊긴 적이 있으면 빼고 붙는다 */
  private membersDenied = false;
  private contentDenied = false;
  private lastIntents = GUILDS;

  async fetch(request: Request) {
    const body = (await request.json().catch(() => ({}))) as Partial<Config> & { stop?: boolean };
    const token = (body.token ?? "").trim();
    const userIds = Array.isArray(body.userIds) ? body.userIds.map(String).filter(Boolean) : [];
    if (body.stop || token.length < 20 || !body.guildId) {
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
    if (this.ws && !this.presenceDenied && Date.now() - this.lastResync > RESYNC_MS) this.requestPresences();
    // 한 시간에 한 번은 Presence Intent 가 켜졌는지 다시 시도
    if ((this.presenceDenied || this.membersDenied || this.contentDenied) && Date.now() - this.lastResync > 60 * 60_000) {
      this.lastResync = Date.now();
      this.presenceDenied = false;
      this.membersDenied = false;
      this.contentDenied = false;
      this.close();
      await this.ensureConnected();
    }
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
        const usedPresence = (this.lastIntents & GUILD_PRESENCES) !== 0;
        const usedContent = (this.lastIntents & MESSAGE_CONTENT) !== 0;
        const usedMembers = (this.lastIntents & GUILD_MEMBERS) !== 0;
        if (ev.code === 4014 && (usedPresence || usedContent || usedMembers)) {
          // 권한 있는 intent 가 꺼져 있음 → 하나씩 빼고 다시 붙는다 (봇 온라인 표시는 유지)
          if (usedPresence) this.presenceDenied = true;
          else if (usedContent) this.contentDenied = true;
          else this.membersDenied = true;
          console.log("status watch: privileged intent disabled", usedPresence ? "presence" : usedContent ? "content" : "members");
          this.ctx.waitUntil(new Promise((r) => setTimeout(r, 2_000)).then(() => this.ensureConnected()));
        } else if (FATAL_CLOSE.has(ev.code)) {
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
    if (!this.ws || !this.config || !this.config.userIds.length) return;
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
          intents: this.intents(),
          properties: { os: "linux", browser: "does-status", device: "does-status" },
          presence: { since: null, activities: [{ name: "DOES", type: 2 }], status: "online", afk: false },
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
      if (!this.presenceDenied) this.requestPresences();
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
    if (frame.t === "MESSAGE_CREATE") {
      const d = frame.d as {
        id?: string;
        channel_id?: string;
        guild_id?: string;
        content?: string;
        author?: { id?: string; bot?: boolean };
      };
      // DOES Auto: ! 로 시작하는 관리 명령
      if (/^\s*!\S/.test(d.content ?? "") && this.config && d.guild_id === this.config.guildId && d.author?.id && !d.author.bot && d.id && d.channel_id) {
        this.ctx.waitUntil(
          this.post({ op: "prefix", guildId: d.guild_id, channelId: d.channel_id, messageId: d.id, userId: d.author.id, content: (d.content ?? "").slice(0, 2000) }),
        );
        return;
      }
      // 숫자만 보낸 메시지만 넘긴다 (숫자 맞추기)
      const m = /^\s*(\d{1,9})\s*$/.exec(d.content ?? "");
      if (m && this.config && d.guild_id === this.config.guildId && d.author?.id && !d.author.bot && d.id && d.channel_id) {
        this.ctx.waitUntil(
          this.post({ op: "guess", channelId: d.channel_id, messageId: d.id, userId: d.author.id, guess: Number(m[1]) }),
        );
      }
      return;
    }
    if (frame.t === "GUILD_MEMBER_REMOVE") {
      // 초대 이벤트: 나간 사람은 초대한 사람의 인원에서 뺀다
      const d = frame.d as { guild_id?: string; user?: { id?: string; bot?: boolean } };
      if (this.config && d.guild_id === this.config.guildId && d.user?.id && !d.user.bot) {
        this.ctx.waitUntil(this.post({ op: "member_remove", userId: d.user.id, guildId: this.config.guildId }));
      }
      return;
    }
    if (frame.t === "GUILD_MEMBER_ADD") {
      const d = frame.d as { guild_id?: string; user?: { id?: string; avatar?: string | null; bot?: boolean } };
      if (this.config && d.guild_id === this.config.guildId) this.ctx.waitUntil(this.forwardMember(d));
      return;
    }
    if (frame.t === "PRESENCE_UPDATE") {
      const d = frame.d as { guild_id?: string; user?: { id?: string }; status?: string };
      if (!this.config || d.guild_id !== this.config.guildId || !d.user?.id) return;
      this.update(d.user.id, toStatus(d.status));
    }
  }

  private intents() {
    let v = GUILDS;
    if (!this.membersDenied) v |= GUILD_MEMBERS;
    if (!this.contentDenied) v |= GUILD_MESSAGES | MESSAGE_CONTENT;
    if (!this.presenceDenied && this.config?.userIds.length) v |= GUILD_PRESENCES;
    this.lastIntents = v;
    return v;
  }

  private async post(body: Record<string, unknown>) {
    const secret = (this.env.AOS_BRIDGE_SECRET || this.env.AUTH_SECRET || "").trim();
    const req = new Request("https://vendix.team/api/discord/server-status", {
      method: "POST",
      headers: { "content-type": "application/json", "x-vendix-bridge-secret": secret },
      body: JSON.stringify(body),
    });
    try {
      await (this.env.WORKER_SELF_REFERENCE?.fetch(req) ?? fetch(req));
    } catch (err) {
      console.log("status watch post failed", String(err));
    }
  }

  /** 새 멤버 → 환영 패널 */
  private async forwardMember(d: { user?: { id?: string; avatar?: string | null; bot?: boolean } }) {
    if (!d.user?.id || !this.config) return;
    const secret = (this.env.AOS_BRIDGE_SECRET || this.env.AUTH_SECRET || "").trim();
    const req = new Request("https://vendix.team/api/discord/server-status", {
      method: "POST",
      headers: { "content-type": "application/json", "x-vendix-bridge-secret": secret },
      body: JSON.stringify({
        op: "member_add",
        userId: d.user.id,
        guildId: this.config.guildId,
        avatar: d.user.avatar ?? null,
        bot: Boolean(d.user.bot),
      }),
    });
    try {
      const res = await (this.env.WORKER_SELF_REFERENCE?.fetch(req) ?? fetch(req));
      console.log("status watch welcome", d.user.id, res.status);
    } catch (err) {
      console.log("status watch welcome failed", String(err));
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
