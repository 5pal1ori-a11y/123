/**
 * /서버상황 — 관리자(지정한 디스코드 사용자)가 지금 온라인인지 보여 주는 고정 패널.
 * 상태는 StatusWatch Durable Object 가 디스코드 게이트웨이(PRESENCE_UPDATE)로 받아 /api/discord/server-status 로 넘긴다.
 */
import { container, MessageFlags, mediaGallery, separator, textDisplay } from "@/lib/discord/components";
import { editChannelMessage, postChannelMessage } from "@/lib/discord/rest";
import { getShopById, getShopSettings, persistAsync, updateShopSettings } from "@/lib/store";

export const DEFAULT_STATUS_USER_ID = "1093602656905334784";
export type PresenceStatus = "online" | "idle" | "dnd" | "offline";

const MAX_PANELS = 10;

function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://vendix.team").replace(/\/$/, "");
}

const LABEL: Record<PresenceStatus, string> = {
  online: "온라인",
  idle: "자리 비움",
  dnd: "다른 용무 중",
  offline: "오프라인",
};

export function buildServerStatusPanel(shopId: string) {
  const settings = getShopSettings(shopId);
  const userId = settings.serverStatusUserId || DEFAULT_STATUS_USER_ID;
  const last = settings.serverStatusLast ?? null;
  const status: PresenceStatus = last?.status ?? "offline";
  const online = status !== "offline";
  const since = last ? Math.floor(new Date(last.since).getTime() / 1000) : null;
  const now = Math.floor(Date.now() / 1000);
  // 디스코드가 같은 주소 이미지를 오래 캐시하므로 상태마다 다른 파일을 쓴다
  const image = `${appOrigin()}/brand/${online ? "admin-online" : "admin-offline"}.png`;

  return {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [
      container(
        [
          textDisplay(`## ${getShopById(shopId)?.name ?? "DOES"} 관리자 상황`),
          mediaGallery([image]),
          textDisplay(
            [
              `<@${userId}> 님은 지금 **${LABEL[status]}**${online ? "" : " 상태예요"}`,
              since ? `-# ${online ? "접속한 지" : "마지막 접속"} <t:${since}:R>` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          ),
          separator(true, 1),
          textDisplay(`-# 상태가 바뀌면 바로 갱신돼요 · 확인 <t:${now}:R>`),
        ],
        online ? 0x22c55e : 0xef4444,
      ),
    ],
    allowed_mentions: { parse: [] as string[] },
  };
}

/** 올라가 있는 모든 패널을 고쳐 쓴다. 지워진 패널은 목록에서 뺀다 */
export async function refreshServerStatusPanels(shopId: string) {
  const settings = getShopSettings(shopId);
  const panels = settings.serverStatusPanels ?? [];
  if (!panels.length) return { ok: true as const, panels: 0 };
  const payload = buildServerStatusPanel(shopId);
  const alive: typeof panels = [];
  for (const p of panels) {
    const r = await editChannelMessage(p.channelId, p.messageId, payload, shopId).catch(() => null);
    // 404(삭제됨)만 버리고, 일시 오류는 남겨 둔다
    if (r?.ok || (r && r.status !== 404)) alive.push(p);
  }
  if (alive.length !== panels.length) {
    updateShopSettings(shopId, { serverStatusPanels: alive });
    await persistAsync();
  }
  return { ok: true as const, panels: alive.length };
}

/** 패널을 새로 올리고 목록에 넣는다 */
export async function postServerStatusPanel(shopId: string, channelId: string, userId?: string | null) {
  if (userId) updateShopSettings(shopId, { serverStatusUserId: userId });
  const posted = await postChannelMessage(channelId, buildServerStatusPanel(shopId), shopId);
  const id = posted.ok ? (posted.json as { id?: string } | null)?.id : null;
  if (!id) return { ok: false as const, status: posted.status };
  const panels = [...(getShopSettings(shopId).serverStatusPanels ?? []), { channelId, messageId: String(id) }].slice(
    -MAX_PANELS,
  );
  updateShopSettings(shopId, { serverStatusPanels: panels });
  await persistAsync();
  return { ok: true as const };
}

/** 게이트웨이에서 받은 상태를 저장하고, 바뀌었으면 패널을 고친다 */
export async function applyPresence(shopId: string, userId: string, status: PresenceStatus) {
  const settings = getShopSettings(shopId);
  const watched = settings.serverStatusUserId || DEFAULT_STATUS_USER_ID;
  if (userId !== watched) return { ok: true as const, ignored: true };
  const prev = settings.serverStatusLast;
  const wasOnline = prev ? prev.status !== "offline" : null;
  const isOnline = status !== "offline";
  // 온라인↔오프라인이 바뀔 때만 '언제부터' 를 새로 잡는다 (자리비움↔온라인은 유지)
  const since = wasOnline === isOnline && prev ? prev.since : new Date().toISOString();
  if (prev?.status === status && prev.since === since) return { ok: true as const, changed: false };
  updateShopSettings(shopId, { serverStatusLast: { status, since } });
  await persistAsync();
  await refreshServerStatusPanels(shopId);
  return { ok: true as const, changed: true };
}

type DoNs = { idFromName(name: string): unknown; get(id: unknown): { fetch(url: string, init?: RequestInit): Promise<Response> } };

/** 패널을 올린 직후 바로 게이트웨이를 붙인다 (cron 은 5분마다 같은 일을 한다) */
export async function kickStatusWatch(shopId: string, guildId: string) {
  try {
    const [{ getCloudflareContext }, { doesDiscordEnvAsync }] = await Promise.all([
      import("@opennextjs/cloudflare"),
      import("@/lib/discord/does-env"),
    ]);
    const { env } = await getCloudflareContext({ async: true });
    const ns = (env as { STATUS_WATCH?: DoNs }).STATUS_WATCH;
    if (!ns) return;
    // 무료 플랜에서는 꺼 둔다 (server-status route 참고)
    if ((env as Record<string, string | undefined>).STATUS_WATCH_ENABLED?.trim() !== "1") return;
    const settings = getShopSettings(shopId);
    const token = (await doesDiscordEnvAsync()).botToken;
    if (!token) return;
    await ns.get(ns.idFromName("does")).fetch("https://status-watch/", {
      method: "POST",
      body: JSON.stringify({ token, guildId, userIds: [settings.serverStatusUserId || DEFAULT_STATUS_USER_ID] }),
    });
  } catch (err) {
    console.error("[status-watch] kick failed", err);
  }
}
