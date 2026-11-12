import { verifyWorldTicket } from "../src/lib/world/ticket-core";

type Env = { AUTH_SECRET?: string };

export const WILD_PATH = "/api/wild/ws";

/**
 * 야생 멀티플레이 방 — 상점마다 하나 (WorldRoom 의 `wild:<상점>` 인스턴스가 이 로직으로 돈다).
 * 월드는 초기화되지 않는다.
 *  - 시드 · 시작 시각은 처음 한 번 정해서 계속 쓴다 (모두 같은 지형 · 같은 낮밤)
 *  - 블록 편집 · 상자 내용 · 플레이어별 가방은 SQLite 에 영구 저장
 *  - 위치 · 휘두르기는 저장 없이 가까운 사람에게만 중계
 */

/** 야생 소켓은 첨부 상태에 w: 1 이 붙는다 */
type Pending = { w: 1; pending: true; since: number; room: string };
type Left = { w: 1; left: true };
type Player = {
  w: 1;
  id: string;
  u: string;
  n: string;
  k?: string;
  p: [number, number, number, number, number];
  s: 0 | 1;
  at: number;
  /** 편집 속도 제한 창 */
  ew: number;
  ec: number;
};

const MAX_PLAYERS = 40;
const MAX_MSG = 48_000;
const VIEW = 220;
const EDIT_WINDOW = 5_000;
const EDIT_LIMIT = 2_500;
const WELCOME_BATCH = 12_000;
const COORD = 1_000_000;

const pub = (p: Player) => ({ id: p.id, n: p.n, k: p.k, p: p.p, s: p.s });
const int = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);
const CHEST_KEY = /^-?\d{1,7},\d{1,3},-?\d{1,7}$/;
const ITEM_ID = /^[a-z0-9_]{1,40}$/;
const ENCH_ID = /^[a-z_]{1,24}$/;

type Slot = { id: string; count: number; dmg?: number; ench?: Record<string, number> } | null;

function cleanSlots(v: unknown): Slot[] | null {
  if (!Array.isArray(v) || v.length > 27) return null;
  const out: Slot[] = [];
  for (const s of v) {
    if (s === null) {
      out.push(null);
      continue;
    }
    if (!s || typeof s !== "object") return null;
    const o = s as Record<string, unknown>;
    const count = int(o.count, 1, 64);
    if (typeof o.id !== "string" || !ITEM_ID.test(o.id) || count === null) return null;
    const dmg = int(o.dmg, 0, 10_000);
    const slot: NonNullable<Slot> = dmg === null ? { id: o.id, count } : { id: o.id, count, dmg };
    const ench = cleanEnch(o.ench);
    if (ench) slot.ench = ench;
    out.push(slot);
  }
  return out;
}

function cleanEnch(v: unknown): Record<string, number> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, number> = {};
  let n = 0;
  for (const [k, lv] of Object.entries(v as Record<string, unknown>)) {
    const level = int(lv, 1, 10);
    if (!ENCH_ID.test(k) || level === null || ++n > 8) return null;
    out[k] = level;
  }
  return n ? out : null;
}

export function isWildSocket(ws: WebSocket) {
  const a = ws.deserializeAttachment() as { w?: number } | null;
  return Boolean(a && a.w === 1);
}

export class WildRoomLogic {
  private sql: SqlStorage;

  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS wild_edits (x INTEGER NOT NULL, y INTEGER NOT NULL, z INTEGER NOT NULL, v INTEGER NOT NULL, PRIMARY KEY (x, y, z)) WITHOUT ROWID`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS wild_chests (k TEXT PRIMARY KEY, s TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS wild_players (u TEXT PRIMARY KEY, s TEXT NOT NULL, at INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS wild_meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL)`);
  }

  fetch(request: Request) {
    const room = (new URL(request.url).searchParams.get("room") || "").toLowerCase();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ w: 1, pending: true, since: Date.now(), room } satisfies Pending);
    return new Response(null, { status: 101, webSocket: client });
  }

  async message(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > MAX_MSG) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const state = ws.deserializeAttachment() as Player | Pending | Left | null;
    if (!state || "left" in state) return;
    if ("pending" in state) {
      if (Date.now() - state.since > 30_000) return void ws.close(4001, "slow hello");
      if (msg.t === "hello" && typeof msg.ticket === "string") await this.hello(ws, msg.ticket, state.room);
      return;
    }
    switch (msg.t) {
      case "p":
        return this.onPos(ws, state, msg);
      case "e":
        return this.onEdits(ws, state, msg.e);
      case "ch":
        return this.onChest(ws, msg.k, msg.s);
      case "save":
        return this.onSave(state, msg.s);
      case "sw":
        return this.near(state, { t: "sw", id: state.id }, ws);
    }
  }

  close(ws: WebSocket, code: number) {
    this.leave(ws);
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {
      /* closed */
    }
  }

  error(ws: WebSocket) {
    this.leave(ws);
  }

  /* ───────────── 내부 ───────────── */

  private meta(key: string, make: () => number) {
    const row = this.sql.exec<{ v: number }>("SELECT v FROM wild_meta WHERE k = ?", key).toArray()[0];
    if (row) return row.v;
    const v = make();
    this.sql.exec("INSERT INTO wild_meta (k, v) VALUES (?, ?)", key, v);
    return v;
  }

  private players(exclude?: WebSocket): [WebSocket, Player][] {
    const out: [WebSocket, Player][] = [];
    for (const s of this.ctx.getWebSockets()) {
      if (s === exclude || s.readyState !== WebSocket.OPEN) continue;
      const a = s.deserializeAttachment() as Player | Pending | Left | null;
      if (a && a.w === 1 && "id" in a) out.push([s, a]);
    }
    return out;
  }

  private send(ws: WebSocket, payload: unknown) {
    try {
      ws.send(typeof payload === "string" ? payload : JSON.stringify(payload));
    } catch {
      /* closing */
    }
  }

  private all(payload: unknown, exclude?: WebSocket) {
    const data = JSON.stringify(payload);
    for (const [s] of this.players(exclude)) this.send(s, data);
  }

  /** 가까이 있는 사람에게만 (멀리 있는 사람은 어차피 안 보인다) */
  private near(me: Player, payload: unknown, exclude?: WebSocket) {
    const data = JSON.stringify(payload);
    for (const [s, p] of this.players(exclude)) {
      if (Math.abs(p.p[0] - me.p[0]) > VIEW || Math.abs(p.p[2] - me.p[2]) > VIEW) continue;
      this.send(s, data);
    }
  }

  private async hello(ws: WebSocket, token: string, room: string) {
    const secret = this.env.AUTH_SECRET ?? "";
    const ticket = (await verifyWorldTicket(token, secret)) ?? (secret ? await verifyWorldTicket(token, `${secret}:wild-guest`) : null);
    if (!ticket || ticket.s.toLowerCase() !== room) {
      this.send(ws, { t: "denied" });
      ws.close(4001, "denied");
      return;
    }
    for (const [s, p] of this.players(ws)) {
      if (p.u !== ticket.u) continue;
      this.send(s, { t: "replaced" });
      try {
        s.close(4002, "replaced");
      } catch {
        /* gone */
      }
    }
    const active = this.players(ws).filter(([, p]) => p.u !== ticket.u);
    if (active.length >= MAX_PLAYERS) {
      this.send(ws, { t: "full" });
      ws.close(4003, "full");
      return;
    }
    const now = Date.now();
    const me: Player = {
      w: 1,
      id: crypto.randomUUID().slice(0, 8),
      u: ticket.u,
      n: ticket.n.slice(0, 20),
      k: typeof ticket.k === "string" && /^[0-9a-f]{32}$/.test(ticket.k) ? ticket.k : undefined,
      p: [0, -999, 0, 0, 0],
      s: 0,
      at: 0,
      ew: now,
      ec: 0,
    };
    ws.serializeAttachment(me);

    const seed = this.meta("seed", () => Math.floor(Math.random() * 2 ** 31));
    const t0 = this.meta("t0", () => now);
    const saved = this.sql.exec<{ s: string }>("SELECT s FROM wild_players WHERE u = ?", me.u).toArray()[0];
    const chests: Record<string, unknown> = {};
    for (const row of this.sql.exec<{ k: string; s: string }>("SELECT k, s FROM wild_chests")) {
      try {
        chests[row.k] = JSON.parse(row.s);
      } catch {
        /* 깨진 행 */
      }
    }
    let state: unknown = null;
    if (saved) {
      try {
        state = JSON.parse(saved.s);
      } catch {
        state = null;
      }
    }
    this.send(ws, {
      t: "welcome",
      id: me.id,
      name: me.n,
      seed,
      t0,
      now,
      state,
      chests,
      players: active.map(([, p]) => pub(p)),
    });

    let batch: number[] = [];
    for (const row of this.sql.exec<{ x: number; y: number; z: number; v: number }>("SELECT x, y, z, v FROM wild_edits")) {
      batch.push(row.x, row.y, row.z, row.v);
      if (batch.length >= WELCOME_BATCH * 4) {
        this.send(ws, { t: "e", e: batch });
        batch = [];
      }
    }
    if (batch.length) this.send(ws, { t: "e", e: batch });
    this.send(ws, { t: "ready" });
    this.all({ t: "join", ...pub(me) }, ws);
  }

  private onPos(ws: WebSocket, me: Player, msg: Record<string, unknown>) {
    const now = Date.now();
    if (now - me.at < 45) return;
    const arr = Array.isArray(msg.p) ? msg.p : [];
    me.p = [num(arr[0], -COORD, COORD), num(arr[1], -64, 400), num(arr[2], -COORD, COORD), num(arr[3], -100, 100), num(arr[4], -2, 2)];
    me.s = msg.s === 1 ? 1 : 0;
    me.at = now;
    ws.serializeAttachment(me);
    this.near(me, { t: "p", id: me.id, p: me.p, s: me.s }, ws);
  }

  private onEdits(ws: WebSocket, me: Player, raw: unknown) {
    if (!Array.isArray(raw) || raw.length % 4 !== 0 || raw.length === 0) return;
    const now = Date.now();
    if (now - me.ew > EDIT_WINDOW) {
      me.ew = now;
      me.ec = 0;
    }
    const n = raw.length / 4;
    if (me.ec + n > EDIT_LIMIT) return this.send(ws, { t: "slow" });
    me.ec += n;
    ws.serializeAttachment(me);
    const ok: number[] = [];
    for (let i = 0; i < raw.length; i += 4) {
      const x = int(raw[i], -COORD, COORD);
      const y = int(raw[i + 1], 0, 127);
      const z = int(raw[i + 2], -COORD, COORD);
      const v = int(raw[i + 3], 0, 0xffff);
      if (x === null || y === null || z === null || v === null) continue;
      this.sql.exec("INSERT INTO wild_edits (x, y, z, v) VALUES (?, ?, ?, ?) ON CONFLICT (x, y, z) DO UPDATE SET v = excluded.v", x, y, z, v);
      ok.push(x, y, z, v);
    }
    if (ok.length) this.all({ t: "e", id: me.id, e: ok }, ws);
  }

  private onChest(ws: WebSocket, k: unknown, s: unknown) {
    if (typeof k !== "string" || !CHEST_KEY.test(k)) return;
    if (s === null) {
      this.sql.exec("DELETE FROM wild_chests WHERE k = ?", k);
      this.all({ t: "ch", k, s: null }, ws);
      return;
    }
    const slots = cleanSlots(s);
    if (!slots) return;
    this.sql.exec("INSERT INTO wild_chests (k, s) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET s = excluded.s", k, JSON.stringify(slots));
    this.all({ t: "ch", k, s: slots }, ws);
  }

  /** 플레이어별 가방 · 체력 — 형식은 클라이언트가 정하고 서버는 크기만 본다 */
  private onSave(me: Player, s: unknown) {
    if (!s || typeof s !== "object") return;
    const json = JSON.stringify(s);
    if (json.length > 24_000) return;
    this.sql.exec("INSERT INTO wild_players (u, s, at) VALUES (?, ?, ?) ON CONFLICT (u) DO UPDATE SET s = excluded.s, at = excluded.at", me.u, json, Date.now());
  }

  private leave(ws: WebSocket) {
    const a = ws.deserializeAttachment() as Player | Pending | Left | null;
    if (!a || !("id" in a)) return;
    ws.serializeAttachment({ w: 1, left: true } satisfies Left);
    this.all({ t: "gone", id: a.id }, ws);
  }
}
