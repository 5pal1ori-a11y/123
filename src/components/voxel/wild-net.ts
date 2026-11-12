import type { Stack } from "@/lib/voxel/items";
import { shopHeaders } from "@/lib/shop-client";

export type WildStatus = "connecting" | "online" | "offline" | "denied" | "replaced" | "full";
export type WildPeer = { id: string; n: string; k?: string; p: number[]; s: 0 | 1 };
/** 서버에 맡겨 두는 내 가방 · 체력 (월드 편집과 따로 플레이어마다) */
export type WildSave = { inv: unknown; hp: number; food: number; sat: number; xp?: number };
export type WildWelcome = {
  id: string;
  name: string;
  seed: number;
  /** 월드 시작 시각을 이 브라우저 시계로 옮긴 값 */
  t0: number;
  state: WildSave | null;
  chests: Record<string, (Stack | null)[]>;
  players: WildPeer[];
};

export type WildEvents = {
  status: (s: WildStatus) => void;
  welcome: (w: WildWelcome) => void;
  edits: (e: number[]) => void;
  ready: () => void;
  join: (p: WildPeer) => void;
  pos: (id: string, p: number[], sneak: 0 | 1) => void;
  gone: (id: string) => void;
  swing: (id: string) => void;
  chest: (k: string, s: (Stack | null)[] | null) => void;
};

const GUEST_KEY = "does-wild:guest";
const EDIT_CHUNK = 1500;

function guestId() {
  try {
    let id = localStorage.getItem(GUEST_KEY);
    if (!id || !/^[a-z0-9]{16,40}$/.test(id)) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24);
      localStorage.setItem(GUEST_KEY, id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 14).padEnd(16, "0");
  }
}

/** 야생 멀티플레이 연결 — 끊기면 알아서 다시 붙고, 다시 붙을 때마다 월드 편집을 처음부터 받는다 */
export class WildNet {
  private ws: WebSocket | null = null;
  private closed = false;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private flushT: ReturnType<typeof setInterval> | null = null;
  private outbox: number[] = [];
  private lastPos = "";
  private posAt = 0;
  private ready = false;

  constructor(
    private shopSlug: string,
    private on: WildEvents,
  ) {}

  get online() {
    return this.ready && this.ws?.readyState === WebSocket.OPEN;
  }

  async connect() {
    if (this.closed) return;
    this.on.status("connecting");
    try {
      const res = await fetch("/api/world/wild-ticket", {
        method: "POST",
        credentials: "include",
        headers: shopHeaders(this.shopSlug),
        body: JSON.stringify({ guest: guestId() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ticket?: string; room?: string };
      if (!res.ok || !data.ticket) throw new Error("ticket");
      if (this.closed) return;
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/api/wild/ws?room=${encodeURIComponent(data.room || this.shopSlug)}`);
      this.ws = ws;
      this.ready = false;
      ws.onopen = () => {
        ws.send(JSON.stringify({ t: "hello", ticket: data.ticket }));
        this.ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("ping"), 25_000);
        this.flushT = setInterval(() => this.flush(), 120);
      };
      ws.onmessage = (ev) => this.handle(ev.data);
      ws.onclose = (ev) => {
        if (this.ping) clearInterval(this.ping);
        if (this.flushT) clearInterval(this.flushT);
        this.ping = null;
        this.flushT = null;
        if (this.ws === ws) this.ws = null;
        this.ready = false;
        if (this.closed) return;
        if (ev.code === 4001) return this.on.status("denied");
        if (ev.code === 4002) return this.on.status("replaced");
        if (ev.code === 4003) return this.on.status("full");
        this.on.status("offline");
        this.schedule();
      };
    } catch {
      this.on.status("offline");
      this.schedule();
    }
  }

  private schedule() {
    if (this.closed || this.timer) return;
    const wait = Math.min(15_000, 1000 * 2 ** this.retry++);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.connect();
    }, wait);
  }

  private handle(raw: unknown) {
    if (typeof raw !== "string" || raw === "pong") return;
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    switch (m.t) {
      case "welcome": {
        this.retry = 0;
        const offset = Date.now() - (Number(m.now) || Date.now());
        this.on.welcome({
          id: String(m.id),
          name: String(m.name ?? ""),
          seed: Number(m.seed) >>> 0,
          t0: (Number(m.t0) || Date.now()) + offset,
          state: (m.state as WildSave | null) ?? null,
          chests: (m.chests as WildWelcome["chests"]) ?? {},
          players: Array.isArray(m.players) ? (m.players as WildPeer[]) : [],
        });
        return;
      }
      case "e":
        if (Array.isArray(m.e)) this.on.edits(m.e as number[]);
        return;
      case "ready":
        this.ready = true;
        this.on.status("online");
        this.on.ready();
        return;
      case "join":
        this.on.join(m as unknown as WildPeer);
        return;
      case "p":
        if (Array.isArray(m.p)) this.on.pos(String(m.id), m.p as number[], m.s === 1 ? 1 : 0);
        return;
      case "gone":
        this.on.gone(String(m.id));
        return;
      case "sw":
        this.on.swing(String(m.id));
        return;
      case "ch":
        if (typeof m.k === "string") this.on.chest(m.k, (m.s as (Stack | null)[] | null) ?? null);
        return;
      case "denied":
        this.on.status("denied");
        return;
      case "replaced":
        this.on.status("replaced");
        return;
      case "full":
        this.on.status("full");
        return;
    }
  }

  private send(payload: unknown) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || !this.ready) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }

  /** 편집은 모아서 보낸다 (물 흐름처럼 한 번에 많이 바뀌어도 메시지 수가 적게) */
  edits(flat: number[]) {
    for (const v of flat) this.outbox.push(v);
  }

  private flush() {
    if (!this.outbox.length || !this.online) return;
    while (this.outbox.length) {
      const part = this.outbox.splice(0, EDIT_CHUNK * 4);
      if (!this.send({ t: "e", e: part })) {
        this.outbox.unshift(...part);
        return;
      }
    }
  }

  pos(p: number[], sneak: 0 | 1) {
    const now = performance.now();
    if (now - this.posAt < 110) return;
    const key = `${p.map((v) => Math.round(v * 20)).join(",")}|${sneak}`;
    if (key === this.lastPos && now - this.posAt < 2000) return;
    if (this.send({ t: "p", p, s: sneak })) {
      this.lastPos = key;
      this.posAt = now;
    }
  }

  swing() {
    this.send({ t: "sw" });
  }

  chest(k: string, s: (Stack | null)[] | null) {
    this.send({ t: "ch", k, s });
  }

  save(state: WildSave) {
    this.send({ t: "save", s: state });
  }

  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.ping) clearInterval(this.ping);
    if (this.flushT) clearInterval(this.flushT);
    this.flush();
    this.ws?.close(1000, "bye");
    this.ws = null;
  }
}
