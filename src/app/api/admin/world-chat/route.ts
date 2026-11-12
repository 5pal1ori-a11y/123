import { NextResponse } from "next/server";
import { forbidUnlessStaffCan, isShop, isShopAdmin, requireShop, serverError, unauthorized } from "@/lib/api";
import { maskEmail } from "@/lib/pii";
import { getShopSettings, getUserById, initStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type ChatLine = { n: string; m: string; at: number; u: string };
type WorldNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> };
};

/** 광장(마크 월드) 채팅 기록 — WorldRoom Durable Object 가 7일치를 들고 있다 */
export async function GET(request: Request) {
  try {
    await initStore();
    const shop = requireShop(request);
    if (!isShop(shop)) return shop;
    if (!isShopAdmin(request, shop)) return unauthorized();
    const denied = forbidUnlessStaffCan(request, shop, "logs");
    if (denied) return denied;

    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const e = env as unknown as { WORLD?: WorldNamespace; AUTH_SECRET?: string };
    if (!e.WORLD || !e.AUTH_SECRET) {
      return NextResponse.json({ error: "월드 서버에 연결할 수 없어요" }, { status: 503 });
    }
    const stub = e.WORLD.get(e.WORLD.idFromName(`world:${shop.slug.toLowerCase()}`));
    const res = await stub.fetch("https://world/__admin/chat", { headers: { "x-world-admin": e.AUTH_SECRET } });
    if (!res.ok) return NextResponse.json({ error: "채팅 기록을 불러오지 못했어요" }, { status: 502 });
    const data = (await res.json()) as { chat: ChatLine[]; players: { n: string; u: string; z: number }[] };

    const mask = getShopSettings(shop.id).maskPiiInAdmin;
    const who = (u: string) => {
      const user = getUserById(u);
      return user && user.shopId === shop.id
        ? {
            userId: user.id,
            email: mask ? maskEmail(user.email) : user.email,
            discord: user.discordUsername ?? null,
          }
        : { userId: u, email: null, discord: null };
    };
    return NextResponse.json(
      {
        chat: data.chat
          .slice()
          .reverse()
          .map((c) => ({ name: c.n, message: c.m, at: new Date(c.at).toISOString(), ...who(c.u) })),
        players: data.players.map((p) => ({ name: p.n, inPlaza: p.z === 1, ...who(p.u) })),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return serverError(err);
  }
}
