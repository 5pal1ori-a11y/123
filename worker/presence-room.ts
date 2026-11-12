import { DurableObject } from "cloudflare:workers";

/** v: 방문자(브라우저) ID, u: 서명이 확인된 회원 ID */
type Attachment = { v: string; u?: string };
type Env = { AUTH_SECRET?: string };

const SEEN_PREFIX = "seen:";

function b64url(buf: ArrayBuffer) {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** src/lib/presence-token.ts 가 만든 `${userId}.${exp}.${sig}` 검증 */
async function verifyToken(secret: string, room: string, token: string): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!userId || !Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${room}:${userId}:${expRaw}`));
  const expected = b64url(mac);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? userId.slice(0, 64) : null;
}

/** 한 상점(room)의 실시간 접속자. 탭이 여러 개여도 방문자 ID 기준으로 한 명으로 센다. */
export class PresenceRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    // 관리자 회원목록용: 지금 접속 중인 회원 + 회원별 마지막 접속 종료 시각
    if (url.pathname.endsWith("/users") && request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      const online = [...this.onlineUsers()];
      const stored = await this.ctx.storage.list<number>({ prefix: SEEN_PREFIX });
      const lastSeen: Record<string, number> = {};
      for (const [k, v] of stored) lastSeen[k.slice(SEEN_PREFIX.length)] = v;
      return Response.json({ online, lastSeen });
    }

    const visitor = (url.searchParams.get("v") || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
    const room = (url.searchParams.get("room") || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
    const token = url.searchParams.get("t") || "";
    const secret = (this.env.AUTH_SECRET || "").trim();
    let userId: string | null = null;
    if (token && room && secret) {
      try {
        userId = await verifyToken(secret, room, token);
      } catch {
        userId = null;
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    const attachment: Attachment = { v: visitor || crypto.randomUUID() };
    if (userId) attachment.u = userId;
    server.serializeAttachment(attachment);
    if (userId) await this.ctx.storage.delete(SEEN_PREFIX + userId);
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (message === "count") ws.send(JSON.stringify({ count: this.count() }));
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {
      /* already closed */
    }
    await this.markLeft(ws);
    this.broadcast(ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.markLeft(ws);
    this.broadcast(ws);
  }

  /** 회원의 마지막 탭이 닫히면 그 시각을 기록한다 */
  private async markLeft(ws: WebSocket) {
    const a = ws.deserializeAttachment() as Attachment | null;
    if (!a?.u) return;
    if (this.onlineUsers(ws).has(a.u)) return;
    await this.ctx.storage.put(SEEN_PREFIX + a.u, Date.now());
  }

  private open(exclude?: WebSocket) {
    return this.ctx.getWebSockets().filter((s) => s !== exclude && s.readyState === WebSocket.OPEN);
  }

  private onlineUsers(exclude?: WebSocket) {
    const ids = new Set<string>();
    for (const s of this.open(exclude)) {
      const a = s.deserializeAttachment() as Attachment | null;
      if (a?.u) ids.add(a.u);
    }
    return ids;
  }

  private count(exclude?: WebSocket) {
    const ids = new Set<string>();
    for (const s of this.open(exclude)) {
      const a = s.deserializeAttachment() as Attachment | null;
      ids.add(a?.v || "anon");
    }
    return ids.size;
  }

  private broadcast(exclude?: WebSocket) {
    const payload = JSON.stringify({ count: this.count(exclude) });
    for (const s of this.open(exclude)) {
      try {
        s.send(payload);
      } catch {
        /* closing */
      }
    }
  }
}
