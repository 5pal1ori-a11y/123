import { shopHeaders } from "@/lib/shop-client";
import type { NetPos } from "./world-engine";

export type NetStatus = "connecting" | "online" | "offline" | "denied" | "replaced" | "full";
export type NetPlayer = { id: string; n: string; p: NetPos; m: 0 | 1; dead: 0 | 1; k?: string };

export type NetEvents = {
  status: (s: NetStatus) => void;
  welcome: (id: string, hp: number, online: number, players: NetPlayer[]) => void;
  online: (n: number) => void;
  pos: (pl: NetPlayer) => void;
  join: (id: string, name: string) => void;
  roster: (players: NetPlayer[]) => void;
  gone: (id: string) => void;
  hurt: (e: { id: string; hp: number; by: string; kx: number; kz: number; me?: boolean; ko?: boolean; duel?: boolean }) => void;
  die: (e: { id: string; n: string; by: string; bn: string }) => void;
  respawn: (id: string) => void;
  heal: (id: string) => void;
  swing: (id: string) => void;
  hp: (hp: number) => void;
  safe: (game: boolean) => void;
  duel: (e: DuelEvent) => void;
  chat: (lines: ChatLine[], history?: boolean) => void;
};

export type ChatLine = { n: string; m: string; at: number; sys?: boolean };

function chatLine(v: unknown): ChatLine | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  if (typeof c.m !== "string") return null;
  return { n: typeof c.n === "string" ? c.n : "", m: c.m, at: Number(c.at) || Date.now(), sys: c.sys === 1 };
}

export type DuelTop = { n: string; w: number; l: number; b: number };

export type DuelEvent =
  | { t: "dq"; on: boolean; n: number }
  | { t: "dch"; id: string; n: string }
  | { t: "dcs"; n: string }
  | { t: "dno"; n?: string; busy?: boolean; expired?: boolean; gone?: boolean }
  | { t: "dfull" }
  | { t: "dstart"; slot: number; side: 0 | 1; opp: string; on: string; delay: number; limit: number; hp: number }
  | { t: "dend"; reason: "ko" | "time" | "out" | "leave"; draw: boolean; win: boolean; wn: string; ln: string; streak: number; w: number; l: number; hp: number }
  | { t: "dfeed"; k: "start" | "end" | "draw"; a: string; b: string; reason?: string; streak?: number }
  | { t: "dtop"; top: DuelTop[]; me: { w: number; l: number; s: number; b: number }; q: boolean; n: number; live: number; slots: number };

export class WorldNet {
  private ws: WebSocket | null = null;
  private closed = false;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private lastPos = "";

  constructor(
    private shopSlug: string,
    private on: NetEvents,
  ) {}

  async connect() {
    if (this.closed) return;
    this.on.status("connecting");
    try {
      const res = await fetch("/api/world/ticket", { method: "POST", credentials: "include", headers: shopHeaders(this.shopSlug) });
      const data = (await res.json().catch(() => ({}))) as { ticket?: string; room?: string };
      if (!res.ok || !data.ticket) throw new Error("ticket");
      if (this.closed) return;
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/api/world/ws?room=${encodeURIComponent(data.room || this.shopSlug)}`);
      this.ws = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ t: "hello", ticket: data.ticket }));
        this.ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("ping"), 25_000);
      };
      ws.onmessage = (ev) => this.handle(ev.data);
      ws.onclose = (ev) => {
        if (this.ping) clearInterval(this.ping);
        this.ping = null;
        if (this.ws === ws) this.ws = null;
        if (this.closed) return;
        if (ev.code === 4001) return this.on.status("denied");
        if (ev.code === 4002) return this.on.status("replaced");
        if (ev.code === 4003) this.on.status("full");
        else this.on.status("offline");
        this.schedule();
      };
    } catch {
      this.on.status("offline");
      this.schedule();
    }
  }

  private schedule() {
    if (this.closed || this.timer) return;
    const delay = Math.min(30_000, 1500 * 2 ** this.retry++);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.connect();
    }, delay);
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
      case "welcome":
        this.retry = 0;
        this.on.status("online");
        this.on.welcome(String(m.id), Number(m.hp), Number(m.online), (m.players as NetPlayer[]) ?? []);
        if (Array.isArray(m.chat)) this.on.chat(m.chat.map(chatLine).filter((c): c is ChatLine => c !== null), true);
        break;
      case "chat": {
        const line = chatLine(m);
        if (line) this.on.chat([line]);
        break;
      }
      case "online":
        this.on.online(Number(m.online));
        break;
      case "p":
        this.on.pos({
          id: String(m.id),
          n: String(m.n),
          p: m.p as NetPos,
          m: m.m === 1 ? 1 : 0,
          dead: m.dead === 1 ? 1 : 0,
          k: typeof m.k === "string" ? m.k : undefined,
        });
        break;
      case "join":
        this.on.join(String(m.id), String(m.n));
        break;
      case "roster":
        this.on.roster((m.players as NetPlayer[]) ?? []);
        break;
      case "gone":
        this.on.gone(String(m.id));
        break;
      case "hurt":
        this.on.hurt({
          id: String(m.id),
          hp: Number(m.hp),
          by: String(m.by),
          kx: Number(m.kx),
          kz: Number(m.kz),
          me: m.me === true,
          ko: m.ko === 1,
          duel: m.duel === 1,
        });
        break;
      case "heal":
        this.on.heal(String(m.id));
        break;
      case "dq":
        this.on.duel({ t: "dq", on: m.on === 1, n: Number(m.n) || 0 });
        break;
      case "dch":
        this.on.duel({ t: "dch", id: String(m.id), n: String(m.n) });
        break;
      case "dcs":
        this.on.duel({ t: "dcs", n: String(m.n) });
        break;
      case "dno":
        this.on.duel({ t: "dno", n: m.n ? String(m.n) : undefined, busy: m.busy === 1, expired: m.expired === 1, gone: m.gone === 1 });
        break;
      case "dfull":
        this.on.duel({ t: "dfull" });
        break;
      case "dstart":
        this.on.duel({
          t: "dstart",
          slot: Number(m.slot) || 0,
          side: m.side === 1 ? 1 : 0,
          opp: String(m.opp),
          on: String(m.on),
          delay: Number(m.delay) || 0,
          limit: Number(m.limit) || 0,
          hp: Number(m.hp) || 20,
        });
        break;
      case "dend":
        this.on.duel({
          t: "dend",
          reason: (["ko", "time", "out", "leave"].includes(String(m.reason)) ? m.reason : "ko") as "ko",
          draw: m.draw === 1,
          win: m.win === 1,
          wn: String(m.wn),
          ln: String(m.ln),
          streak: Number(m.streak) || 0,
          w: Number(m.w) || 0,
          l: Number(m.l) || 0,
          hp: Number(m.hp) || 20,
        });
        break;
      case "dfeed":
        this.on.duel({
          t: "dfeed",
          k: m.k === "end" ? "end" : m.k === "draw" ? "draw" : "start",
          a: String(m.a),
          b: String(m.b),
          reason: m.reason ? String(m.reason) : undefined,
          streak: Number(m.streak) || 0,
        });
        break;
      case "dtop":
        this.on.duel({
          t: "dtop",
          top: (Array.isArray(m.top) ? m.top : []) as DuelTop[],
          me: (m.me as { w: number; l: number; s: number; b: number }) ?? { w: 0, l: 0, s: 0, b: 0 },
          q: m.q === 1,
          n: Number(m.n) || 0,
          live: Number(m.live) || 0,
          slots: Number(m.slots) || 3,
        });
        break;
      case "die":
        this.on.die({ id: String(m.id), n: String(m.n), by: String(m.by), bn: String(m.bn) });
        break;
      case "respawn":
        this.on.respawn(String(m.id));
        break;
      case "sw":
        this.on.swing(String(m.id));
        break;
      case "hp":
        this.on.hp(Number(m.hp));
        break;
      case "safe":
        this.on.safe(m.game === 1);
        break;
    }
  }

  private send(obj: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  sendPos(state: { p: NetPos; m: 0 | 1; z: 0 | 1 }) {
    const key = JSON.stringify(state);
    if (key === this.lastPos) return;
    this.lastPos = key;
    this.send({ t: "p", ...state });
  }

  /** 가만히 있어도 가끔은 보내서 체력 회복 · 위치를 유지한다 */
  heartbeat(state: { p: NetPos; m: 0 | 1; z: 0 | 1 }) {
    this.lastPos = "";
    this.sendPos(state);
  }

  hit(id: string) {
    this.send({ t: "hit", id });
  }

  swing() {
    this.send({ t: "sw" });
  }

  respawn() {
    this.send({ t: "respawn" });
  }

  duelQueue() {
    this.send({ t: "dq" });
  }

  challenge(id: string) {
    this.send({ t: "dc", id });
  }

  acceptDuel(id: string) {
    this.send({ t: "da", id });
  }

  declineDuel(id: string) {
    this.send({ t: "dd", id });
  }

  duelTop() {
    this.send({ t: "dtop" });
  }

  /** 연결돼 있으면 보내고 true */
  sendChat(text: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.send({ t: "chat", m: text.slice(0, 100) });
    return true;
  }

  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.ping) clearInterval(this.ping);
    this.ws?.close(1000, "bye");
    this.ws = null;
  }
}
