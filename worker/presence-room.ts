import { DurableObject } from "cloudflare:workers";

type Attachment = { v: string };

/** 한 상점(room)의 실시간 접속자. 탭이 여러 개여도 방문자 ID 기준으로 한 명으로 센다. */
export class PresenceRoom extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    const visitor = (url.searchParams.get("v") || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ v: visitor || crypto.randomUUID() } satisfies Attachment);
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
    this.broadcast(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.broadcast(ws);
  }

  private open(exclude?: WebSocket) {
    return this.ctx.getWebSockets().filter((s) => s !== exclude && s.readyState === WebSocket.OPEN);
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
