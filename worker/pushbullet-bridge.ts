import { DurableObject } from "cloudflare:workers";

type Env = { WORKER_SELF_REFERENCE?: Fetcher };

type Config = { slug: string; token: string; origin: string; syncedAt: number };

type PushPayload = {
  type?: string;
  title?: string;
  body?: string;
  package_name?: string;
  application_name?: string;
  notification_id?: string;
  notifications?: { title?: string; body?: string }[];
  /** Pushbullet 종단간 암호화를 켜면 내용 대신 이 두 값만 온다 */
  encrypted?: boolean;
  ciphertext?: string;
};

const STREAM = "https://stream.pushbullet.com/websocket/";
/** Pushbullet 은 30초마다 nop 을 보내므로 이보다 오래 조용하면 끊긴 것으로 본다 */
const STALE_MS = 75_000;
const ALARM_MS = 30_000;
/** cron 이 이 시간 동안 다시 등록하지 않으면 (토큰 삭제·자동충전 끔) 연결을 닫는다 */
const ORPHAN_MS = 20 * 60_000;
const DEDUPE_MS = 120_000;
const REFUSED_BACKOFF_MS = 10 * 60_000;

const looksLikeDeposit = (text: string) => /입금|\d[\d,]*\s*원/.test(text);

/** 상점 하나의 Pushbullet 알림 스트림을 계속 열어 두고, 입금 알림을 /api/charges/auto 로 넘긴다 */
export class PushbulletBridge extends DurableObject<Env> {
  private ws: WebSocket | null = null;
  private config: Config | null = null;
  private lastMessage = 0;
  private connecting = false;
  /** 토큰이 거절되면 (만료·삭제) 잠시 다시 붙지 않는다 */
  private refusedUntil = 0;
  private recent = new Map<string, number>();
  /** 진단용: 마지막으로 받은 알림 (내용은 저장하지 않음) */
  private lastPush: { at: number; type: string; app: string; deposit: boolean; forwarded: number | null } | null = null;
  /** 진단용: 연결 시각 · 연결 후 받은 메시지 종류별 개수 (저장소에도 남겨 재시작돼도 보임) */
  private diag = { bootAt: Date.now(), connects: 0, connectedAt: 0, closes: 0, lastClose: "", counts: {} as Record<string, number> };

  async fetch(request: Request) {
    const body = (await request.json().catch(() => ({}))) as Partial<Config> & { stop?: boolean };
    if (body.stop) {
      await this.shutdown();
      return Response.json({ ok: true, stopped: true });
    }
    const slug = (body.slug ?? "").trim();
    const token = (body.token ?? "").trim();
    if (!slug || token.length < 8) return Response.json({ ok: false }, { status: 400 });

    const prev = this.config ?? (await this.ctx.storage.get<Config>("config")) ?? null;
    const next: Config = {
      slug,
      token,
      origin: (body.origin ?? "").trim() || "https://vendix.team",
      syncedAt: Date.now(),
    };
    this.config = next;
    await this.ctx.storage.put("config", next);
    if (prev && prev.token !== token) {
      this.close();
      this.refusedUntil = 0;
    }

    await this.ensureConnected();
    await this.ctx.storage.setAlarm(Date.now() + ALARM_MS);
    const savedPush = this.lastPush ?? (await this.ctx.storage.get<typeof this.lastPush>("lastPush")) ?? null;
    return Response.json({ ok: true, connected: !!this.ws, lastMessage: this.lastMessage, lastPush: savedPush, diag: this.diag });
  }

  async alarm() {
    this.config ??= (await this.ctx.storage.get<Config>("config")) ?? null;
    if (!this.config) return;
    if (Date.now() - this.config.syncedAt > ORPHAN_MS) {
      await this.shutdown();
      return;
    }
    await this.ensureConnected();
    await this.ctx.storage.setAlarm(Date.now() + ALARM_MS);
  }

  private async shutdown() {
    this.close();
    this.config = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  private close() {
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close(1000, "bye");
    } catch {
      /* already closed */
    }
  }

  private async ensureConnected() {
    if (this.ws && Date.now() - this.lastMessage < STALE_MS) return;
    if (this.connecting || !this.config || Date.now() < this.refusedUntil) return;
    this.close();
    this.connecting = true;
    try {
      const res = await fetch(STREAM + encodeURIComponent(this.config.token), {
        headers: { Upgrade: "websocket" },
      });
      const ws = res.webSocket;
      if (!ws) {
        console.log("pushbullet stream refused", this.config.slug, res.status);
        if (res.status === 401 || res.status === 403) this.refusedUntil = Date.now() + REFUSED_BACKOFF_MS;
        return;
      }
      ws.accept();
      this.ws = ws;
      this.lastMessage = Date.now();
      this.diag.connects += 1;
      this.diag.connectedAt = Date.now();
      console.log("pushbullet stream connected", this.config.slug, this.diag.connects);
      ws.addEventListener("message", (ev) => {
        this.lastMessage = Date.now();
        if (typeof ev.data === "string") this.ctx.waitUntil(this.onMessage(ev.data));
      });
      const drop = (why: string) => {
        this.diag.closes += 1;
        this.diag.lastClose = `${new Date().toISOString()} ${why}`;
        if (this.ws === ws) this.ws = null;
      };
      ws.addEventListener("close", (ev) => drop(`close ${(ev as CloseEvent).code ?? ""}`));
      ws.addEventListener("error", () => drop("error"));
    } catch (err) {
      console.log("pushbullet connect failed", this.config.slug, String(err));
    } finally {
      this.connecting = false;
    }
  }

  private async onMessage(raw: string) {
    let msg: { type?: string; push?: PushPayload };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const kind = msg.type === "push" ? `push:${msg.push?.type ?? "?"}` : (msg.type ?? "?");
    this.diag.counts[kind] = (this.diag.counts[kind] ?? 0) + 1;
    if (msg.type !== "push" || !msg.push) return;
    const push = msg.push;
    if (push.encrypted) {
      // 종단간 암호화: 내용을 읽을 수 없어 입금 처리를 못 한다 → 원인을 바로 알 수 있게 남긴다
      this.lastPush = { at: Date.now(), type: "encrypted", app: "", deposit: false, forwarded: null };
      await this.ctx.storage.put("lastPush", this.lastPush);
      console.log("pushbullet push encrypted", this.config?.slug, "— Pushbullet 종단간 암호화를 끄거나 비밀번호가 필요합니다");
      return;
    }
    // 진단: 어떤 알림이 왔는지 (앱·종류만, 내용은 남기지 않음)
    console.log("pushbullet push", this.config?.slug, push.type, push.package_name ?? push.application_name ?? "-");
    const items: PushPayload[] =
      push.type === "sms_changed"
        ? (push.notifications ?? []).map((n) => ({ title: n.title ?? "", body: n.body ?? "" }))
        : push.type === "mirror"
          ? [push]
          : [];
    for (const item of items) {
      const text = `${item.title ?? ""}\n${item.body ?? ""}`;
      const deposit = looksLikeDeposit(text);
      this.lastPush = { at: Date.now(), type: push.type ?? "", app: item.package_name ?? item.application_name ?? push.package_name ?? "", deposit, forwarded: null };
      await this.ctx.storage.put("lastPush", this.lastPush);
      if (!deposit) console.log("pushbullet push not deposit", this.config?.slug, this.lastPush.app);
      if (!deposit || this.seen(text)) continue;
      await this.forward({
        title: item.title ?? "",
        body: item.body ?? "",
        package_name: item.package_name,
        application_name: item.application_name,
      });
    }
  }

  private seen(key: string) {
    const now = Date.now();
    for (const [k, at] of this.recent) if (now - at > DEDUPE_MS) this.recent.delete(k);
    if (this.recent.has(key)) return true;
    this.recent.set(key, now);
    return false;
  }

  private async forward(push: PushPayload) {
    const cfg = this.config;
    if (!cfg) return;
    const req = new Request(`${cfg.origin.replace(/\/$/, "")}/api/charges/auto`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-orel-shop": cfg.slug,
        "x-vendix-shop": cfg.slug,
        authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify({ push, pushbulletToken: cfg.token }),
    });
    try {
      const res = await (this.env.WORKER_SELF_REFERENCE?.fetch(req) ?? fetch(req));
      console.log("pushbullet forward", cfg.slug, res.status);
      if (this.lastPush) this.lastPush.forwarded = res.status;
    } catch (err) {
      console.log("pushbullet forward failed", cfg.slug, String(err));
    }
  }
}
