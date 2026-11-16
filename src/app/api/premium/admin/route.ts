import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, isShop, isShopAdmin, requireShop, serverError, unauthorized } from "@/lib/api";
import { getStoreForRead as getStore, initStore, userPremiumPlan } from "@/lib/store";
import { adminSetPremium, createPremiumKeys, deletePremiumKey, loadPremiumKeys } from "@/lib/premium";

export const dynamic = "force-dynamic";

/** 관리자: 라이선스 키 목록 · 구독 회원 목록 */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  const { keys } = await loadPremiumKeys(shop.id);
  const users = getStore().users.filter((u) => u.shopId === shop.id);
  const byId = new Map(users.map((u) => [u.id, u]));
  const subs = users
    .filter((u) => u.premium)
    .map((u) => ({
      userId: u.id,
      name: u.name || u.email,
      discordUsername: u.discordUsername,
      plan: u.premium!.plan,
      active: Boolean(userPremiumPlan(u)),
      expiresAt: u.premium!.expiresAt,
    }))
    .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));
  const keyList = Object.values(keys)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 300)
    .map((k) => ({ ...k, usedByName: k.usedBy ? byId.get(k.usedBy)?.name || byId.get(k.usedBy)?.email || k.usedBy : null }));
  return NextResponse.json({ keys: keyList, subs }, { headers: { "cache-control": "no-store" } });
}

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    plan: z.enum(["basic", "plus"]),
    count: z.number().int().min(1).max(50),
    days: z.number().int().min(1).max(365),
    note: z.string().max(80).optional(),
  }),
  z.object({ action: z.literal("delete"), key: z.string().min(4).max(40) }),
  z.object({
    action: z.literal("set"),
    /** 회원 이메일 · 이름 · 디스코드 ID 중 하나 */
    who: z.string().min(1).max(120),
    plan: z.enum(["basic", "plus"]).nullable(),
    days: z.number().int().min(1).max(365).optional(),
  }),
]);

export async function POST(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return badRequest("요청이 올바르지 않아요.");
    const b = parsed.data;
    if (b.action === "create") {
      const keys = await createPremiumKeys(shop.id, b.plan, b.count, b.days, b.note ?? "");
      return NextResponse.json({ ok: true, keys });
    }
    if (b.action === "delete") {
      await deletePremiumKey(shop.id, b.key);
      return NextResponse.json({ ok: true });
    }
    const q = b.who.trim().toLowerCase();
    const user = getStore().users.find(
      (u) => u.shopId === shop.id && (u.email.toLowerCase() === q || u.discordId === b.who.trim() || u.name.toLowerCase() === q || u.id === b.who.trim()),
    );
    if (!user) return badRequest("회원을 찾지 못했어요. 이메일 · 디스코드 ID · 이름으로 찾아 주세요.");
    const premium = await adminSetPremium(shop.id, user.id, b.plan, b.days ?? 30);
    return NextResponse.json({ ok: true, premium });
  } catch (e) {
    if (e instanceof Error && /PASS|키|회원/.test(e.message)) return badRequest(e.message);
    return serverError(e);
  }
}
