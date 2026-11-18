import { NextResponse } from "next/server";
import { forbidUnlessStaffCan, isShop, isShopAdmin, requireShop, unauthorized } from "@/lib/api";
import { initStore, listUsers } from "@/lib/store";
import { listLoginHistory } from "@/lib/store-ext";
import { presenceRoomName } from "@/lib/presence-token";

export const dynamic = "force-dynamic";

type DoNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string): Promise<Response> };
};

/**
 * 회원별 접속 상태: { users: { [userId]: { online, lastSeenAt } } }
 * lastSeenAt = 마지막으로 사이트를 닫은 시각 (기록이 없으면 마지막 로그인 시각)
 */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  const denied = forbidUnlessStaffCan(request, shop, "users");
  if (denied) return denied;

  let online: string[] = [];
  let lastSeen: Record<string, number> = {};
  let live = false;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const ns = (env as { PRESENCE?: DoNamespace }).PRESENCE;
    if (ns) {
      const stub = ns.get(ns.idFromName(presenceRoomName(shop.slug)));
      const res = await stub.fetch("https://presence/users");
      if (res.ok) {
        const data = (await res.json()) as { online?: string[]; lastSeen?: Record<string, number> };
        online = data.online ?? [];
        lastSeen = data.lastSeen ?? {};
        live = true;
      }
    }
  } catch {
    /* 로컬 개발 등 DO 없음 */
  }

  const ids = listUsers(shop.id).map((u) => u.id);
  const onlineSet = new Set(online);
  const users: Record<string, { online: boolean; lastSeenAt: string | null; source: "presence" | "login" | null }> = {};
  for (const id of ids) {
    if (onlineSet.has(id)) {
      users[id] = { online: true, lastSeenAt: null, source: "presence" };
      continue;
    }
    if (lastSeen[id]) {
      users[id] = { online: false, lastSeenAt: new Date(lastSeen[id]).toISOString(), source: "presence" };
      continue;
    }
    const login = listLoginHistory(shop.id, id, "user", 1)[0];
    users[id] = { online: false, lastSeenAt: login?.createdAt ?? null, source: login ? "login" : null };
  }
  return NextResponse.json({ users, live }, { headers: { "Cache-Control": "no-store" } });
}
