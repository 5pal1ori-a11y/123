/**
 * VIP 컨시어지 — 누적 구매 금액으로 등급을 매기고, 고액 고객을 따로 챙긴다.
 *
 *   SILVER 30만 원 ↑  신규 고가 매물(5만 원 ↑) DM 알림
 *   GOLD  100만 원 ↑  + 전용 컨시어지 채널 · 맞춤 계정 요청
 *   BLACK 300만 원 ↑  + 매니저 역할 호출 (요청 시 매니저 멘션)
 */
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";

export type VipTierId = "silver" | "gold" | "black";
export const VIP_TIERS: { id: VipTierId; name: string; min: number; color: number; perks: string[] }[] = [
  { id: "silver", name: "VIP SILVER", min: 300_000, color: 0x94a3b8, perks: ["신규 고가 매물(5만 원 ↑) DM 알림", "VIP 등급 카드 · 다음 등급 안내"] },
  { id: "gold", name: "VIP GOLD", min: 1_000_000, color: 0xf59e0b, perks: ["SILVER 혜택 전부", "전용 컨시어지 채널", "맞춤 계정 요청 (원하는 조건 · 예산)"] },
  { id: "black", name: "VIP BLACK", min: 3_000_000, color: 0x111827, perks: ["GOLD 혜택 전부", "요청하면 매니저 바로 호출", "희귀 매물 공개 전 개별 제안"] },
];
export const VIP_ALERT_MIN_PRICE = 50_000;
const COUNTED = new Set(["dispensed", "paid", "awaiting_fulfillment"]);

type VipRequest = { id: string; userId: string; text: string; budget: number | null; createdAt: string; status: "open" | "done" };
type Db = { channels: Record<string, string>; requests: VipRequest[]; seen: string[] | null };
const key = (shopId: string) => `vip:v1:${shopId}`;
const getDb = async (shopId: string): Promise<Db> => {
  const d = await kvGetJson<Db>(key(shopId));
  return { channels: d?.channels ?? {}, requests: d?.requests ?? [], seen: d?.seen ?? null };
};
const mutate = <T>(shopId: string, fn: (db: Db) => T | Promise<T>) =>
  withLock(key(shopId), async () => {
    const db = await getDb(shopId);
    const out = await fn(db);
    db.requests = db.requests.slice(0, 300);
    await kvPutJson(key(shopId), db);
    return out;
  });

export function tierFor(spent: number) {
  let t: (typeof VIP_TIERS)[number] | null = null;
  for (const x of VIP_TIERS) if (spent >= x.min) t = x;
  return t;
}

export async function spentBy(shopId: string, userId: string) {
  const { getStoreForRead } = await import("@/lib/store");
  return getStoreForRead()
    .orders.filter((o) => o.shopId === shopId && o.userId === userId && COUNTED.has(o.status))
    .reduce((a, o) => a + (o.amount || 0), 0);
}

export async function vipStatus(shopId: string, userId: string) {
  const [spent, db] = await Promise.all([spentBy(shopId, userId), getDb(shopId)]);
  const tier = tierFor(spent);
  const next = VIP_TIERS.find((t) => t.min > spent) ?? null;
  return {
    spent,
    tier: tier ? { id: tier.id, name: tier.name, perks: tier.perks } : null,
    next: next ? { name: next.name, min: next.min, remaining: next.min - spent } : null,
    channelId: db.channels[userId] ?? null,
    requests: db.requests.filter((r) => r.userId === userId).slice(0, 10),
  };
}

const atLeast = (tier: VipTierId | undefined | null, need: VipTierId) => !!tier && VIP_TIERS.findIndex((t) => t.id === tier) >= VIP_TIERS.findIndex((t) => t.id === need);

/** GOLD 이상 — 디스코드에 나만 보이는 컨시어지 채널을 만든다 (이미 있으면 그 채널) */
export async function openVipChannel(shopId: string, userId: string) {
  const [{ getUserById, getShopSettings, MFA_DISCORD_GUILD_ID }, { discordRest }] = await Promise.all([import("@/lib/store"), import("@/lib/discord/rest")]);
  const user = getUserById(userId);
  if (!user?.discordId) throw new Error("디스코드가 연결된 계정만 전용 채널을 열 수 있어요.");
  const st = await vipStatus(shopId, userId);
  if (!atLeast(st.tier?.id, "gold")) throw new Error(`전용 채널은 VIP GOLD(누적 ${(1_000_000).toLocaleString("ko-KR")}원)부터 열 수 있어요.`);
  if (st.channelId) {
    const r = await discordRest("GET", `/channels/${st.channelId}`, undefined, shopId);
    if (r.ok) return { channelId: st.channelId, created: false };
  }
  const s = getShopSettings(shopId);
  const guildId = s.discordGuildId || MFA_DISCORD_GUILD_ID;
  const me = (await discordRest("GET", "/users/@me", undefined, shopId)).json as { id?: string } | null;
  // 채널 보기 1024 · 메시지 보내기 2048 · 파일 첨부 32768 · 기록 보기 65536
  const VIEW = 1024;
  const allow = String(1024 + 2048 + 32768 + 65536);
  const overwrites: { id: string; type: number; allow?: string; deny?: string }[] = [
    { id: guildId, type: 0, deny: String(VIEW) },
    { id: user.discordId, type: 1, allow },
  ];
  if (me?.id) overwrites.push({ id: me.id, type: 1, allow });
  if (s.vipManagerRoleId) overwrites.push({ id: s.vipManagerRoleId, type: 0, allow });
  const made = await discordRest(
    "POST",
    `/guilds/${guildId}/channels`,
    { name: `vip-${(user.name || "회원").replace(/[^0-9A-Za-z가-힣_-]/g, "").slice(0, 20) || "회원"}`, type: 0, topic: `${st.tier!.name} 컨시어지 · 원하는 계정 · 문의를 편하게 남겨 주세요`, ...(s.vipCategoryId ? { parent_id: s.vipCategoryId } : {}), permission_overwrites: overwrites },
    shopId,
  );
  const channelId = (made.json as { id?: string } | null)?.id;
  if (!made.ok || !channelId) throw new Error("채널을 만들지 못했어요. 관리자에게 봇의 '채널 관리' 권한을 확인해 달라고 해 주세요.");
  await mutate(shopId, (db) => {
    db.channels[userId] = channelId;
  });
  const { postChannelMessage } = await import("@/lib/discord/rest");
  await postChannelMessage(
    channelId,
    {
      content: [`<@${user.discordId}> 님, **${st.tier!.name}** 전용 컨시어지 채널이에요.${s.vipManagerRoleId ? ` <@&${s.vipManagerRoleId}>` : ""}`, "원하는 계정 조건 · 예산 · 문의를 여기에 편하게 남겨 주세요. 매니저가 직접 챙겨 드려요."].join("\n"),
      allowed_mentions: { users: [user.discordId], roles: s.vipManagerRoleId ? [s.vipManagerRoleId] : [] },
    },
    shopId,
  ).catch(() => null);
  return { channelId, created: true };
}

/** GOLD 이상 — 맞춤 계정 요청 (전용 채널 · 관리자 채널에 올린다) */
export async function requestConcierge(shopId: string, userId: string, text: string, budget: number | null) {
  const body = text.trim().slice(0, 800);
  if (body.length < 5) throw new Error("원하는 계정 조건을 5자 이상 적어 주세요.");
  const [{ getUserById, getShopSettings }, { postChannelMessage }] = await Promise.all([import("@/lib/store"), import("@/lib/discord/rest")]);
  const user = getUserById(userId);
  const st = await vipStatus(shopId, userId);
  if (!atLeast(st.tier?.id, "gold")) throw new Error("맞춤 요청은 VIP GOLD부터 쓸 수 있어요.");
  const req: VipRequest = { id: `vr_${crypto.randomUUID().slice(0, 8)}`, userId, text: body, budget: budget && budget > 0 ? Math.round(budget) : null, createdAt: new Date().toISOString(), status: "open" };
  await mutate(shopId, (db) => {
    db.requests.unshift(req);
  });
  const s = getShopSettings(shopId);
  const mention = st.tier!.id === "black" && s.vipManagerRoleId ? `<@&${s.vipManagerRoleId}> ` : "";
  const msg = `${mention}**[${st.tier!.name} 맞춤 요청]** ${user?.discordId ? `<@${user.discordId}>` : user?.name ?? "회원"} · 누적 ${st.spent.toLocaleString("ko-KR")}원\n> ${body.replace(/\n/g, "\n> ")}${req.budget ? `\n예산 ${req.budget.toLocaleString("ko-KR")}원` : ""}`;
  const allowed = { users: user?.discordId ? [user.discordId] : [], roles: mention && s.vipManagerRoleId ? [s.vipManagerRoleId] : [] };
  if (st.channelId) await postChannelMessage(st.channelId, { content: msg, allowed_mentions: allowed }, shopId).catch(() => null);
  const adminCh = s.proxyAdminChannelId || s.buybackAdminChannelId || s.coinAdminChannelId;
  if (adminCh) await postChannelMessage(adminCh, { content: msg, allowed_mentions: allowed }, shopId).catch(() => null);
  return req;
}

export async function setVipSettings(shopId: string, patch: { vipCategoryId?: string | null; vipManagerRoleId?: string | null }) {
  const { updateShopSettings, persistAsync } = await import("@/lib/store");
  updateShopSettings(shopId, patch);
  await persistAsync();
}

/** 크론 — 새로 올라온 고가 매물을 SILVER 이상에게 먼저 DM 으로 알린다 (처음 돌 때는 기준만 잡는다) */
export async function runVipListingAlerts(shopId: string) {
  const { listProducts, getStoreForRead } = await import("@/lib/store");
  const products = listProducts(shopId).filter((p) => p.availableCount > 0);
  const db0 = await getDb(shopId);
  const seen = new Set(db0.seen ?? []);
  const fresh = db0.seen === null ? [] : products.filter((p) => !seen.has(p.id) && p.price >= VIP_ALERT_MIN_PRICE);
  if (db0.seen !== null && !products.some((p) => !seen.has(p.id))) return { alerted: 0 };
  await mutate(shopId, (db) => {
    db.seen = [...new Set([...(db.seen ?? []), ...products.map((p) => p.id)])].slice(-2000);
  });
  if (!fresh.length) return { alerted: 0 };
  // SILVER 이상 · 디스코드 연결된 회원
  const spent = new Map<string, number>();
  for (const o of getStoreForRead().orders) if (o.shopId === shopId && o.userId && COUNTED.has(o.status)) spent.set(o.userId, (spent.get(o.userId) ?? 0) + (o.amount || 0));
  const vips = getStoreForRead()
    .users.filter((u) => u.shopId === shopId && u.discordId && (spent.get(u.id) ?? 0) >= VIP_TIERS[0]!.min)
    .slice(0, 60);
  if (!vips.length) return { alerted: 0 };
  const { sendDiscordDm } = await import("@/lib/discord/dm");
  const { shopUrl } = await import("@/lib/domain");
  const { getShopById } = await import("@/lib/store");
  const slug = getShopById(shopId)?.slug ?? "mfa";
  const text = [`**[DOES VIP] 새 고가 매물이 올라왔어요** — VIP 회원에게 따로 알려 드려요`, ...fresh.slice(0, 5).map((p) => `· **${p.name}** ${p.price.toLocaleString("ko-KR")}원 — ${shopUrl(slug, `/product/${p.slug}`)}`)].join("\n");
  let n = 0;
  for (const u of vips) {
    const r = await sendDiscordDm(u.discordId!, { content: text.slice(0, 1900) }, shopId).catch(() => null);
    if (r?.ok) n++;
  }
  return { alerted: n };
}
