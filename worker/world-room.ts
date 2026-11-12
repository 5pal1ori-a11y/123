import { DurableObject } from "cloudflare:workers";
import { ARENAS, arenaAt, DUEL_COUNTDOWN_MS, DUEL_LIMIT_MS, gameRegion } from "../src/lib/world/games";
import { verifyWorldTicket } from "../src/lib/world/ticket-core";
import { WILD_PATH, WildRoomLogic, isWildSocket } from "./wild-room";

type Env = { AUTH_SECRET?: string };

type Duel = { mid: string; opp: string; on: string; slot: number; side: 0 | 1; start: number; until: number };
type DuelStat = { n: string; w: number; l: number; s: number; b: number };

/** 소켓마다 붙는 상태 (Hibernation 이후에도 남는다) */
type Player = {
  id: string;
  u: string;
  n: string;
  p: [number, number, number, number, number];
  m: 0 | 1;
  /** 1 = 메인 광장 */
  z: 0 | 1;
  hp: number;
  dead: 0 | 1;
  hurtAt: number;
  hitAt: number;
  inv: number;
  at: number;
  regenAt: number;
  /** 결투 대기열에 들어온 시각 (0 = 대기 안 함) */
  q?: number;
  d?: Duel | null;
  /** 보낸 결투 신청 */
  ch?: { to: string; at: number } | null;
  /** 마지막 채팅 시각 */
  ca?: number;
  /** 마인크래프트 UUID (스킨) */
  k?: string;
};

const pub = (p: Player) => ({ id: p.id, n: p.n, p: p.p, m: p.m, dead: p.dead, k: p.k });

type ChatLine = { n: string; m: string; at: number };
/** 관리자 패널용 채팅 기록 — 누가 보냈는지(u) 까지 남긴다 */
type AdminChatLine = ChatLine & { u: string };

const CHALLENGE_TTL = 20_000;
const CHAT_MAX = 100;
const CHAT_GAP = 800;
const CHAT_KEEP = 30;
const CHAT_TTL = 60 * 60_000;
const ADMIN_CHAT_KEEP = 1000;
const ADMIN_CHAT_TTL = 7 * 24 * 60 * 60_000;
export const ADMIN_CHAT_PATH = "/__admin/chat";

type Pending = { pending: true; since: number; room: string };

const MAX_PLAYERS = 60;
const MAX_HP = 20;
const DAMAGE = 2;
const REACH = 4.2;
const HIT_COOLDOWN = 420;
const IFRAMES = 500;
const RESPAWN_INV = 3000;
/** 광장 스폰 보호 구역 — src/lib/world/layout.ts 의 PLAZA_SPAWN 과 같은 자리 */
const SAFE = { x: 400.5, z: 14.5, r: 3.2 };

const clampNum = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);

export class WorldRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  /** `wild:<상점>` 인스턴스는 야생 방으로 쓴다 (새 클래스 없이 같은 Durable Object 를 재사용) */
  private wildRoom: WildRoomLogic | null = null;
  private wild() {
    return (this.wildRoom ??= new WildRoomLogic(this.ctx, this.env));
  }

  async fetch(request: Request) {
    if (new URL(request.url).pathname === ADMIN_CHAT_PATH) return this.adminChat(request);
    if (new URL(request.url).pathname === WILD_PATH) return this.wild().fetch(request);
    const room = (new URL(request.url).searchParams.get("room") || "").toLowerCase();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ pending: true, since: Date.now(), room } satisfies Pending);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (isWildSocket(ws)) return this.wild().message(ws, raw);
    if (typeof raw !== "string" || raw.length > 600) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const state = ws.deserializeAttachment() as Player | Pending | null;
    if (!state) return;

    if ("pending" in state) {
      if (msg.t === "hello" && typeof msg.ticket === "string") await this.hello(ws, msg.ticket, state.room);
      return;
    }

    const now = Date.now();
    switch (msg.t) {
      case "p":
        return this.onPos(ws, state, msg, now);
      case "hit":
        return this.onHit(ws, state, String(msg.id ?? ""), now);
      case "sw":
        if (state.z === 1) this.broadcast({ t: "sw", id: state.id }, ws, true);
        return;
      case "dq":
        return this.onQueue(ws, state, now);
      case "dc":
        return this.onChallenge(ws, state, String(msg.id ?? ""), now);
      case "da":
        return this.onAccept(ws, state, String(msg.id ?? ""), now);
      case "dd":
        return this.onDecline(state, String(msg.id ?? ""));
      case "dtop":
        return this.sendTop(ws, state);
      case "chat":
        return this.onChat(ws, state, msg.m, now);
      case "respawn":
        if (!state.dead) return;
        state.dead = 0;
        state.hp = MAX_HP;
        state.inv = now + RESPAWN_INV;
        state.hurtAt = 0;
        ws.serializeAttachment(state);
        ws.send(JSON.stringify({ t: "hp", hp: state.hp }));
        this.broadcast({ t: "respawn", id: state.id }, ws, true);
        return;
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    if (isWildSocket(ws)) return this.wild().close(ws, code);
    this.leave(ws);
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {
      /* closed */
    }
  }

  async webSocketError(ws: WebSocket) {
    if (isWildSocket(ws)) return this.wild().error(ws);
    this.leave(ws);
  }

  /* ───────────── 내부 ───────────── */

  /** Next 관리자 API 가 AUTH_SECRET 을 붙여 부른다 (외부에서는 이 경로로 들어올 수 없다) */
  private async adminChat(request: Request) {
    const secret = this.env.AUTH_SECRET ?? "";
    if (!secret || request.headers.get("x-world-admin") !== secret) {
      return new Response("forbidden", { status: 403 });
    }
    const now = Date.now();
    const chat = ((await this.ctx.storage.get<AdminChatLine[]>("chatlog")) ?? []).filter(
      (c) => now - c.at < ADMIN_CHAT_TTL,
    );
    const players = this.players().map(([, p]) => ({ n: p.n, u: p.u, z: p.z }));
    return Response.json({ chat, players });
  }

  private players(exclude?: WebSocket): [WebSocket, Player][] {
    const out: [WebSocket, Player][] = [];
    for (const s of this.ctx.getWebSockets()) {
      if (s === exclude || s.readyState !== WebSocket.OPEN) continue;
      const a = s.deserializeAttachment() as Player | Pending | null;
      if (a && !("pending" in a)) out.push([s, a]);
    }
    return out;
  }

  private broadcast(payload: unknown, exclude?: WebSocket, plazaOnly = false) {
    const data = JSON.stringify(payload);
    for (const [s, p] of this.players(exclude)) {
      if (plazaOnly && p.z !== 1) continue;
      try {
        s.send(data);
      } catch {
        /* closing */
      }
    }
  }

  private async hello(ws: WebSocket, token: string, room: string) {
    const ticket = await verifyWorldTicket(token, this.env.AUTH_SECRET ?? "");
    if (!ticket || ticket.s.toLowerCase() !== room) {
      ws.send(JSON.stringify({ t: "denied" }));
      ws.close(4001, "denied");
      return;
    }
    const others = this.players(ws);
    for (const [s, p] of others) {
      if (p.u === ticket.u) {
        try {
          s.send(JSON.stringify({ t: "replaced" }));
          s.close(4002, "replaced");
        } catch {
          /* gone */
        }
      }
    }
    const active = this.players(ws).filter(([, p]) => p.u !== ticket.u);
    if (active.length >= MAX_PLAYERS) {
      ws.send(JSON.stringify({ t: "full" }));
      ws.close(4003, "full");
      return;
    }
    const now = Date.now();
    const me: Player = {
      id: crypto.randomUUID().slice(0, 8),
      u: ticket.u,
      n: ticket.n.slice(0, 20),
      p: [0, 0, 0, 0, 0],
      m: 0,
      z: 0,
      hp: MAX_HP,
      dead: 0,
      hurtAt: 0,
      hitAt: 0,
      inv: now + RESPAWN_INV,
      at: 0,
      regenAt: now,
      k: typeof ticket.k === "string" && /^[0-9a-f]{32}$/.test(ticket.k) ? ticket.k : undefined,
    };
    ws.serializeAttachment(me);
    const chat = ((await this.ctx.storage.get<ChatLine[]>("chat")) ?? []).filter((c) => now - c.at < CHAT_TTL);
    ws.send(
      JSON.stringify({
        t: "welcome",
        id: me.id,
        hp: me.hp,
        online: active.length + 1,
        players: active.filter(([, p]) => p.z === 1).map(([, p]) => pub(p)),
        chat,
      }),
    );
    this.broadcast({ t: "online", online: active.length + 1 }, ws);
  }

  private async onChat(ws: WebSocket, me: Player, raw: unknown, now: number) {
    if (typeof raw !== "string") return;
    const text = raw
      .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, CHAT_MAX);
    if (!text) return;
    if (now - (me.ca ?? 0) < CHAT_GAP) return this.send(ws, { t: "chat", sys: 1, m: "채팅을 너무 빨리 보내고 있어요", at: now });
    me.ca = now;
    ws.serializeAttachment(me);
    const line: ChatLine = { n: me.n, m: text, at: now };
    this.broadcast({ t: "chat", ...line });
    const log = ((await this.ctx.storage.get<ChatLine[]>("chat")) ?? []).filter((c) => now - c.at < CHAT_TTL);
    log.push(line);
    const adminLog = ((await this.ctx.storage.get<AdminChatLine[]>("chatlog")) ?? []).filter(
      (c) => now - c.at < ADMIN_CHAT_TTL,
    );
    adminLog.push({ ...line, u: me.u });
    await this.ctx.storage.put({ chat: log.slice(-CHAT_KEEP), chatlog: adminLog.slice(-ADMIN_CHAT_KEEP) });
  }

  private onPos(ws: WebSocket, me: Player, msg: Record<string, unknown>, now: number) {
    if (now - me.at < 40) return;
    const arr = Array.isArray(msg.p) ? msg.p : [];
    const zone: 0 | 1 = msg.z === 1 ? 1 : 0;
    const wasPlaza = me.z === 1;
    me.p = [
      clampNum(arr[0], -2000, 2000),
      clampNum(arr[1], -200, 400),
      clampNum(arr[2], -2000, 2000),
      clampNum(arr[3], -100, 100),
      clampNum(arr[4], -2, 2),
    ];
    me.m = msg.m === 1 ? 1 : 0;
    me.z = zone;
    me.at = now;

    if (me.d && now >= me.d.start) {
      if (arenaAt(me.p[0], me.p[2]) !== me.d.slot) {
        ws.serializeAttachment(me);
        return void this.forfeit(ws, me, "out");
      }
      if (now > me.d.until) {
        ws.serializeAttachment(me);
        return void this.timeUp(ws, me);
      }
    }

    if (!me.d && !me.dead && me.hp < MAX_HP && now - me.hurtAt > 5000 && now - me.regenAt > 2000) {
      me.hp += 1;
      me.regenAt = now;
      ws.send(JSON.stringify({ t: "hp", hp: me.hp }));
    }
    ws.serializeAttachment(me);

    if (zone === 1) {
      this.broadcast({ t: "p", ...pub(me) }, ws, true);
      if (!wasPlaza) {
        this.broadcast({ t: "join", id: me.id, n: me.n }, ws, true);
        ws.send(
          JSON.stringify({
            t: "roster",
            players: this.players(ws)
              .filter(([, p]) => p.z === 1)
              .map(([, p]) => pub(p)),
          }),
        );
      }
    } else if (wasPlaza) {
      this.broadcast({ t: "gone", id: me.id }, ws, true);
    }
  }

  private onHit(ws: WebSocket, me: Player, targetId: string, now: number) {
    if (me.z !== 1 || me.dead || now - me.hitAt < HIT_COOLDOWN) return;
    const found = this.players(ws).find(([, p]) => p.id === targetId);
    if (!found) return;
    const [ts, target] = found;
    if (target.z !== 1 || target.dead || now < target.inv) return;
    const dx = target.p[0] - me.p[0];
    const dy = target.p[1] - me.p[1];
    const dz = target.p[2] - me.p[2];
    if (Math.hypot(dx, dy, dz) > REACH) return;
    const duel = me.d && target.d && me.d.mid === target.d.mid ? me.d : null;
    if (me.d && (!duel || now < me.d.start)) return;
    if (!duel && target.d) return;
    if (!duel && (gameRegion(me.p[0], me.p[2]) || gameRegion(target.p[0], target.p[2]))) {
      ws.send(JSON.stringify({ t: "safe", game: 1 }));
      return;
    }
    if (Math.hypot(target.p[0] - SAFE.x, target.p[2] - SAFE.z) < SAFE.r) {
      ws.send(JSON.stringify({ t: "safe" }));
      return;
    }

    me.hitAt = now;
    ws.serializeAttachment(me);

    target.hp = Math.max(0, target.hp - DAMAGE);
    target.hurtAt = now;
    target.inv = now + IFRAMES;
    const len = Math.hypot(dx, dz) || 1;
    const kx = (dx / len) * 7;
    const kz = (dz / len) * 7;
    const ko = target.hp === 0 ? 1 : 0;
    if (ko && !duel) target.dead = 1;
    ts.serializeAttachment(target);

    this.broadcast({ t: "hurt", id: target.id, hp: target.hp, by: me.id, kx, kz, ko }, ts, true);
    try {
      ts.send(JSON.stringify({ t: "hurt", id: target.id, hp: target.hp, by: me.id, kx, kz, ko, me: true, duel: duel ? 1 : 0 }));
    } catch {
      /* gone */
    }
    if (ko && duel) return void this.endDuel([ws, me], [ts, target], "ko");
    if (target.dead) this.broadcast({ t: "die", id: target.id, n: target.n, by: me.id, bn: me.n });
  }

  private leave(ws: WebSocket) {
    const a = ws.deserializeAttachment() as Player | Pending | null;
    if (!a || "pending" in a) return;
    if (a.d) void this.forfeit(ws, a, "leave");
    if (a.z === 1) this.broadcast({ t: "gone", id: a.id }, ws, true);
    this.broadcast({ t: "online", online: this.players(ws).length }, ws);
  }

  /* ───────────── 1:1 결투 ───────────── */

  private send(ws: WebSocket | null, payload: unknown) {
    if (!ws) return;
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      /* closing */
    }
  }

  private byId(id: string, exclude?: WebSocket) {
    return this.players(exclude).find(([, p]) => p.id === id) ?? null;
  }

  private freeSlot() {
    const used = new Set(this.players().flatMap(([, p]) => (p.d ? [p.d.slot] : [])));
    return ARENAS.findIndex((_, i) => !used.has(i));
  }

  private queueSize() {
    return this.players().filter(([, p]) => p.q && !p.d).length;
  }

  private onQueue(ws: WebSocket, me: Player, now: number) {
    if (me.d) return;
    me.q = me.q ? 0 : now;
    ws.serializeAttachment(me);
    this.send(ws, { t: "dq", on: me.q ? 1 : 0, n: this.queueSize() });
    this.matchQueue();
  }

  private matchQueue() {
    for (;;) {
      const waiting = this.players()
        .filter(([, p]) => p.q && !p.d && !p.dead)
        .sort((a, b) => (a[1].q ?? 0) - (b[1].q ?? 0));
      if (waiting.length < 2) return;
      const slot = this.freeSlot();
      if (slot < 0) {
        for (const [s] of waiting) this.send(s, { t: "dfull" });
        return;
      }
      this.startDuel(waiting[0]!, waiting[1]!, slot);
    }
  }

  private onChallenge(ws: WebSocket, me: Player, targetId: string, now: number) {
    if (me.d || me.dead || targetId === me.id) return;
    const found = this.byId(targetId, ws);
    if (!found) return;
    const [ts, target] = found;
    if (target.d) return this.send(ws, { t: "dno", n: target.n, busy: 1 });
    if (me.ch && me.ch.to === targetId && now - me.ch.at < 4000) return;
    me.ch = { to: targetId, at: now };
    ws.serializeAttachment(me);
    this.send(ts, { t: "dch", id: me.id, n: me.n });
    this.send(ws, { t: "dcs", n: target.n });
  }

  private onAccept(ws: WebSocket, me: Player, fromId: string, now: number) {
    if (me.d || me.dead) return;
    const found = this.byId(fromId, ws);
    if (!found) return this.send(ws, { t: "dno", gone: 1 });
    const [cs, from] = found;
    if (!from.ch || from.ch.to !== me.id || now - from.ch.at > CHALLENGE_TTL) return this.send(ws, { t: "dno", n: from.n, expired: 1 });
    if (from.d || from.dead) return this.send(ws, { t: "dno", n: from.n, busy: 1 });
    const slot = this.freeSlot();
    if (slot < 0) {
      this.send(ws, { t: "dfull" });
      this.send(cs, { t: "dfull" });
      return;
    }
    this.startDuel([cs, from], [ws, me], slot);
  }

  private onDecline(me: Player, fromId: string) {
    const found = this.byId(fromId);
    if (!found) return;
    const [cs, from] = found;
    if (from.ch?.to !== me.id) return;
    from.ch = null;
    cs.serializeAttachment(from);
    this.send(cs, { t: "dno", n: me.n });
  }

  private startDuel([as, a]: [WebSocket, Player], [bs, b]: [WebSocket, Player], slot: number) {
    const now = Date.now();
    const mid = crypto.randomUUID().slice(0, 8);
    const start = now + DUEL_COUNTDOWN_MS;
    const until = start + DUEL_LIMIT_MS;
    const sides: [WebSocket, Player, Player, 0 | 1][] = [
      [as, a, b, 0],
      [bs, b, a, 1],
    ];
    for (const [s, p, o, side] of sides) {
      p.d = { mid, opp: o.id, on: o.n, slot, side, start, until };
      p.q = 0;
      p.ch = null;
      p.hp = MAX_HP;
      p.dead = 0;
      p.hurtAt = 0;
      p.inv = start;
      s.serializeAttachment(p);
      this.send(s, { t: "dstart", slot, side, opp: o.id, on: o.n, delay: DUEL_COUNTDOWN_MS, limit: DUEL_LIMIT_MS, hp: MAX_HP });
    }
    this.broadcast({ t: "dfeed", k: "start", a: a.n, b: b.n }, undefined, true);
  }

  /** 상대가 없어졌거나 경기장 밖으로 나가면 기권 */
  private async forfeit(ws: WebSocket, me: Player, reason: "out" | "leave") {
    const d = me.d;
    if (!d) return;
    const found = this.byId(d.opp, ws);
    if (!found || found[1].d?.mid !== d.mid) {
      me.d = null;
      if (reason !== "leave") ws.serializeAttachment(me);
      return;
    }
    await this.endDuel(found, [reason === "leave" ? null : ws, me], reason);
  }

  private async timeUp(ws: WebSocket, me: Player) {
    const d = me.d;
    if (!d) return;
    const found = this.byId(d.opp, ws);
    if (!found || found[1].d?.mid !== d.mid) return this.forfeit(ws, me, "out");
    const [os, opp] = found;
    if (me.hp === opp.hp) return this.endDuel([ws, me], [os, opp], "time", true);
    return me.hp > opp.hp ? this.endDuel([ws, me], [os, opp], "time") : this.endDuel([os, opp], [ws, me], "time");
  }

  private async endDuel(
    [ws, w]: [WebSocket | null, Player],
    [ls, l]: [WebSocket | null, Player],
    reason: "ko" | "time" | "out" | "leave",
    draw = false,
  ) {
    const now = Date.now();
    for (const [s, p] of [
      [ws, w],
      [ls, l],
    ] as const) {
      p.d = null;
      p.hp = MAX_HP;
      p.dead = 0;
      p.hurtAt = 0;
      p.inv = now + 2000;
      if (s) s.serializeAttachment(p);
    }

    const stats = (await this.ctx.storage.get<Record<string, DuelStat>>("duels")) ?? {};
    const st = (p: Player) => (stats[p.u] ??= { n: p.n, w: 0, l: 0, s: 0, b: 0 });
    const sw = st(w);
    const sl = st(l);
    sw.n = w.n;
    sl.n = l.n;
    if (!draw) {
      sw.w += 1;
      sw.s += 1;
      sw.b = Math.max(sw.b, sw.s);
      sl.l += 1;
      sl.s = 0;
    }
    const keep = Object.entries(stats)
      .sort((a, b) => b[1].w - a[1].w)
      .slice(0, 300);
    await this.ctx.storage.put("duels", Object.fromEntries(keep));

    const base = { t: "dend", reason, draw: draw ? 1 : 0, wn: w.n, ln: l.n, hp: MAX_HP };
    this.send(ws, { ...base, win: draw ? 0 : 1, streak: sw.s, w: sw.w, l: sw.l });
    this.send(ls, { ...base, win: 0, streak: sl.s, w: sl.w, l: sl.l });
    this.broadcast({ t: "dfeed", k: draw ? "draw" : "end", a: w.n, b: l.n, reason, streak: draw ? 0 : sw.s }, undefined, true);
    this.broadcast({ t: "heal", id: w.id }, ws ?? undefined, true);
    this.broadcast({ t: "heal", id: l.id }, ls ?? undefined, true);
    this.matchQueue();
  }

  private async sendTop(ws: WebSocket, me: Player) {
    const stats = (await this.ctx.storage.get<Record<string, DuelStat>>("duels")) ?? {};
    const top = Object.values(stats)
      .sort((a, b) => b.w - a.w || a.l - b.l)
      .slice(0, 5)
      .map(({ n, w, l, b }) => ({ n, w, l, b }));
    const mine = stats[me.u];
    this.send(ws, {
      t: "dtop",
      top,
      me: mine ? { w: mine.w, l: mine.l, s: mine.s, b: mine.b } : { w: 0, l: 0, s: 0, b: 0 },
      q: me.q ? 1 : 0,
      n: this.queueSize(),
      live: Math.ceil(this.players().filter(([, p]) => p.d).length / 2),
      slots: ARENAS.length,
    });
  }
}
