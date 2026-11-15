/** 사이트에 접속해 있는 회원 브라우저로 실시간 알림을 보낸다 (PresenceRoom Durable Object 경유) */
import { presenceRoomName } from "@/lib/presence-token";

type DoNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> };
};

export async function notifyUser(shopSlug: string, userId: string, payload: Record<string, unknown>) {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const ns = (env as { PRESENCE?: DoNamespace }).PRESENCE;
    if (!ns) return false;
    const res = await ns.get(ns.idFromName(presenceRoomName(shopSlug))).fetch("https://presence/notify", {
      method: "POST",
      body: JSON.stringify({ userId, payload }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
