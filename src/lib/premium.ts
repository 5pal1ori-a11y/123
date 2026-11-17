/**
 * 프리미엄 플랜 (BASIC PASS · DOES PASS+) — 계좌이체라 라이선스 키로 지급한다.
 * - 회원이 포인트로 구독하면 키를 자동 발급해 바로 적용한다.
 * - 관리자가 키를 만들어 따로 판매하면, 회원이 「프리미엄 플랜」 탭에서 키를 넣어 30일씩 켠다.
 * 구독 상태는 회원 정보(user.premium)에 두어 결제 할인 · 우선 구매가 바로 반영된다. 키 목록은 KV.
 */
import { randomBytes } from "crypto";
import { RESALE_DEFAULT_FEE_PERCENT } from "@/lib/resale-shared";
import { PREMIUM_PLANS, PREMIUM_DAYS, type PremiumPlanId } from "@/lib/premium-plans";
import { addUserPoints, getShopSettings, getUserById, persistAsync, setUserPremium, userPremiumPlan } from "@/lib/store";
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";
import type { ShopUser } from "@/lib/types";

export { PREMIUM_PLANS, PREMIUM_DAYS, type PremiumPlanId } from "@/lib/premium-plans";

export type PremiumKey = {
  key: string;
  plan: PremiumPlanId;
  days: number;
  createdAt: string;
  note: string;
  usedBy: string | null;
  usedAt: string | null;
};

type KeyDb = { keys: Record<string, PremiumKey>; roles?: Partial<Record<PremiumPlanId, string>> };

const kvKey = (shopId: string) => `premium:v1:${shopId}`;

export async function loadPremiumKeys(shopId: string): Promise<KeyDb> {
  const d = await kvGetJson<KeyDb>(kvKey(shopId));
  return { keys: d?.keys ?? {}, roles: d?.roles ?? {} };
}

async function mutate<T>(shopId: string, fn: (db: KeyDb) => T | Promise<T>) {
  return withLock(kvKey(shopId), async () => {
    const db = await loadPremiumKeys(shopId);
    const out = await fn(db);
    await kvPutJson(kvKey(shopId), db);
    return out;
  });
}

export async function premiumBenefits(shopId: string, userId: string | null | undefined) {
  const user = userId ? getUserById(userId) : null;
  const planId = user && user.shopId === shopId ? userPremiumPlan(user) : null;
  const plan = planId ? PREMIUM_PLANS[planId] : null;
  return {
    plan: plan?.id ?? null,
    planName: plan?.name ?? null,
    expiresAt: plan ? user!.premium!.expiresAt : null,
    extraDiscountPercent: plan?.extraDiscountPercent ?? 0,
    resaleFeePercent: plan?.resaleFeePercent ?? RESALE_DEFAULT_FEE_PERCENT,
    earlyAccessMinutes: plan?.earlyAccessMinutes ?? 0,
    mine: plan?.mine ?? null,
  };
}

/** 다이아캐기 배수 — 보상을 받을 때 한 번 굴린다 */
export function rollMineMultiplier(planId: PremiumPlanId | null): number {
  const mine = planId ? PREMIUM_PLANS[planId].mine : null;
  if (!mine) return 1;
  if (mine.kind === "fixed") return mine.multiplier;
  if (Math.random() >= mine.chance) return 1;
  // 2배가 가장 잦고 최대 배수로 갈수록 드물게
  return Math.min(mine.max, 2 + Math.floor(Math.pow(Math.random(), 2) * (mine.max - 1)));
}

function newKey() {
  return randomBytes(8).toString("hex").toUpperCase().match(/.{4}/g)!.join("-");
}

export function normalizeKey(raw: string) {
  return (raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").match(/.{1,4}/g) ?? []).join("-");
}

export async function createPremiumKeys(shopId: string, plan: PremiumPlanId, count: number, days: number, note: string) {
  return mutate(shopId, (db) => {
    const out: PremiumKey[] = [];
    for (let i = 0; i < Math.min(50, Math.max(1, count)); i++) {
      let k = newKey();
      while (db.keys[k]) k = newKey();
      const item: PremiumKey = { key: k, plan, days, createdAt: new Date().toISOString(), note: note.slice(0, 80), usedBy: null, usedAt: null };
      db.keys[k] = item;
      out.push(item);
    }
    return out;
  });
}

export async function deletePremiumKey(shopId: string, key: string) {
  return mutate(shopId, (db) => {
    const k = db.keys[key];
    if (!k) throw new Error("키를 찾을 수 없어요.");
    if (k.usedBy) throw new Error("이미 사용된 키는 지울 수 없어요.");
    delete db.keys[key];
    return true;
  });
}

/** 구독 기간 계산 — 같은 플랜이면 남은 기간에 이어 붙이고, 다른 플랜이면 지금부터 */
function nextPremium(user: ShopUser, plan: PremiumPlanId, days: number): NonNullable<ShopUser["premium"]> {
  const now = Date.now();
  const cur = userPremiumPlan(user) ? user.premium! : null;
  if (cur && cur.plan === "plus" && plan === "basic") {
    throw new Error("DOES PASS+ 사용 중에는 BASIC PASS 를 켤 수 없어요. 기간이 끝난 뒤에 이용해 주세요.");
  }
  const same = cur && cur.plan === plan;
  const base = same ? new Date(cur.expiresAt).getTime() : now;
  return {
    plan,
    startedAt: same ? cur.startedAt : new Date(now).toISOString(),
    expiresAt: new Date(base + days * 86_400_000).toISOString(),
    lastPointsAt: same ? cur.lastPointsAt : null,
  };
}

/** 프리미엄 안내 DM (카드 이미지 + 글자) */
async function premiumDm(shopId: string, userId: string, kind: "start" | "soon" | "expired") {
  const user = getUserById(userId);
  const p = user?.premium;
  if (!user?.discordId || !p) return;
  const { getShopById } = await import("@/lib/store");
  const slug = getShopById(shopId)?.slug;
  if (!slug) return;
  const plan = PREMIUM_PLANS[p.plan];
  const end = new Date(new Date(p.expiresAt).getTime() + 9 * 3_600_000);
  const endText = `${end.getUTCFullYear()}.${String(end.getUTCMonth() + 1).padStart(2, "0")}.${String(end.getUTCDate()).padStart(2, "0")}`;
  const spec = {
    start: { theme: "gold" as const, eyebrow: "PREMIUM", title: `${plan.name} 시작!`, chips: [`${endText}까지`, ...(plan.monthlyPoints ? [`매월 ${plan.monthlyPoints.toLocaleString("ko-KR")}P`] : []), `${plan.extraDiscountPercent}% 추가 할인`], note: "혜택이 바로 적용됐어요", text: `**${plan.name}** 구독이 시작됐어요! ${endText}까지 혜택이 적용돼요.` },
    soon: { theme: "pink" as const, eyebrow: "PREMIUM", title: "구독이 곧 끝나요", chips: [`${endText} 만료`, "3일 남음"], note: "연장하면 남은 기간에 이어서 붙어요", text: `**${plan.name}** 구독이 **${endText}** 에 끝나요. 사이트 › 프리미엄 플랜에서 연장할 수 있어요.` },
    expired: { theme: "blue" as const, eyebrow: "PREMIUM", title: "구독이 만료됐어요", chips: [`${endText} 만료`], note: "다시 구독하면 혜택이 바로 돌아와요", text: `**${plan.name}** 구독이 만료됐어요. 다시 구독하면 혜택이 바로 돌아와요.` },
  }[kind];
  const card = await import("@/lib/discord/rank-image")
    .then((m) => m.cardImageUrl(slug, { theme: spec.theme, eyebrow: spec.eyebrow, title: spec.title, people: [{ id: user.discordId!, label: plan.name }], chips: spec.chips, note: spec.note }))
    .catch(() => null);
  const { sendDiscordDm } = await import("@/lib/discord/dm");
  const { container, mediaGallery, MessageFlags, textDisplay, actionRow, button, ButtonStyle } = await import("@/lib/discord/components");
  const { shopUrl } = await import("@/lib/domain");
  await sendDiscordDm(
    user.discordId,
    {
      flags: MessageFlags.IS_COMPONENTS_V2,
      components: [
        container([
          ...(card ? [mediaGallery([card])] : []),
          textDisplay(spec.text),
          actionRow(button({ label: "프리미엄 플랜 보기", url: shopUrl(slug, "/dashboard?tab=premium"), style: ButtonStyle.LINK })),
        ]),
      ],
    },
    shopId,
  ).catch(() => null);
}

async function applyPremium(shopId: string, userId: string, plan: PremiumPlanId, days: number) {
  const user = getUserById(userId);
  if (!user || user.shopId !== shopId) throw new Error("회원을 찾을 수 없어요.");
  const premium = nextPremium(user, plan, days);
  const isNew = !user.premium || user.premium.plan !== plan || new Date(user.premium.expiresAt).getTime() <= Date.now();
  setUserPremium(shopId, userId, premium);
  // 새로 시작한 DOES PASS+ 는 첫 달 포인트를 바로 준다
  if (isNew && PREMIUM_PLANS[plan].monthlyPoints > 0) {
    addUserPoints(shopId, userId, PREMIUM_PLANS[plan].monthlyPoints, `premium:${plan}:monthly`);
    setUserPremium(shopId, userId, { ...premium, lastPointsAt: new Date().toISOString() });
  }
  await persistAsync();
  await syncPremiumRole(shopId, userId).catch((err) => console.error("[premium] role sync failed", err));
  await premiumDm(shopId, userId, "start").catch(() => null);
  return getUserById(userId)!.premium!;
}

export async function redeemPremiumKey(shopId: string, userId: string, rawKey: string) {
  const key = normalizeKey(rawKey);
  const k = await mutate(shopId, (db) => {
    const k = db.keys[key];
    if (!k) throw new Error("없는 라이선스 키예요. 다시 확인해 주세요.");
    if (k.usedBy) throw new Error("이미 사용된 라이선스 키예요.");
    // 플랜이 맞지 않으면 키를 쓰지 않는다
    const user = getUserById(userId);
    if (user) nextPremium(user, k.plan, k.days);
    k.usedBy = userId;
    k.usedAt = new Date().toISOString();
    return { ...k };
  });
  const premium = await applyPremium(shopId, userId, k.plan, k.days);
  return { premium, plan: PREMIUM_PLANS[k.plan] };
}

/** 포인트로 구독 — 라이선스 키를 만들어 바로 쓴 것으로 기록한다 */
export async function buyPremiumWithPoints(shopId: string, userId: string, plan: PremiumPlanId) {
  const p = PREMIUM_PLANS[plan];
  const user = getUserById(userId);
  if (!user || user.shopId !== shopId) throw new Error("로그인이 필요해요.");
  nextPremium(user, plan, PREMIUM_DAYS);
  if (user.points < p.price) throw new Error(`포인트가 부족해요. ${p.price.toLocaleString("ko-KR")}P 가 필요해요.`);
  addUserPoints(shopId, userId, -p.price, `premium:${plan}:buy`);
  const [k] = await createPremiumKeys(shopId, plan, 1, PREMIUM_DAYS, `포인트 구독 · ${user.name || user.email}`);
  await mutate(shopId, (db) => {
    const item = db.keys[k!.key];
    if (item) {
      item.usedBy = userId;
      item.usedAt = new Date().toISOString();
    }
  });
  const premium = await applyPremium(shopId, userId, plan, PREMIUM_DAYS);
  return { premium, plan: p, key: k!.key };
}

export async function adminSetPremium(shopId: string, userId: string, plan: PremiumPlanId | null, days: number) {
  if (!plan) {
    setUserPremium(shopId, userId, null);
    await persistAsync();
    await syncPremiumRole(shopId, userId).catch(() => null);
    return null;
  }
  return applyPremium(shopId, userId, plan, days);
}

/* ───────── 디스코드 역할 ───────── */

async function rest(method: string, path: string, body?: unknown) {
  const { discordRest } = await import("@/lib/discord/rest");
  const { doesDiscordEnvAsync } = await import("@/lib/discord/does-env");
  const token = (await doesDiscordEnvAsync()).botToken;
  if (!token) return discordRest(method, path, body);
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
}

/** 플랜별 역할 — 없으면 만들어 두고 KV 에 id 를 저장한다 */
async function ensureRoles(shopId: string, guildId: string) {
  return mutate(shopId, async (db) => {
    db.roles ??= {};
    const list = await rest("GET", `/guilds/${guildId}/roles`);
    const existing = Array.isArray(list.json) ? (list.json as { id: string; name: string }[]) : [];
    for (const plan of Object.keys(PREMIUM_PLANS) as PremiumPlanId[]) {
      const id = db.roles[plan];
      if (id && existing.some((r) => r.id === id)) continue;
      const byName = existing.find((r) => r.name === PREMIUM_PLANS[plan].name);
      if (byName) {
        db.roles[plan] = byName.id;
        continue;
      }
      const made = await rest("POST", `/guilds/${guildId}/roles`, {
        name: PREMIUM_PLANS[plan].name,
        color: plan === "plus" ? 0xfbbf24 : 0x60a5fa,
        hoist: plan === "plus",
        mentionable: false,
      });
      const mid = (made.json as { id?: string } | null)?.id;
      if (mid) db.roles[plan] = mid;
    }
    return { ...db.roles };
  });
}

/** 회원의 디스코드 역할을 구독 상태에 맞춘다 (구독 중 플랜 역할만 남김) */
export async function syncPremiumRole(shopId: string, userId: string) {
  const user = getUserById(userId);
  const guildId = getShopSettings(shopId).discordGuildId;
  if (!user?.discordId || !guildId) return;
  const roles = await ensureRoles(shopId, guildId);
  const want = userPremiumPlan(user);
  for (const plan of Object.keys(PREMIUM_PLANS) as PremiumPlanId[]) {
    const rid = roles[plan];
    if (!rid) continue;
    await rest(plan === want ? "PUT" : "DELETE", `/guilds/${guildId}/members/${user.discordId}/roles/${rid}`);
  }
}

/**
 * 크론 — 월 포인트 지급(DOES PASS+, 30일마다) · 만료된 구독 역할 회수.
 * 만료 회원은 user.premium 을 남겨 두되(기록용) 역할만 뺀다.
 */
export async function premiumCron(shopId: string, users: ShopUser[]) {
  const now = Date.now();
  let granted = 0;
  let expired = 0;
  for (const u of users) {
    const p = u.premium;
    if (!p) continue;
    const active = new Date(p.expiresAt).getTime() > now;
    if (!active) {
      if (!(p as { roleRemoved?: boolean }).roleRemoved) {
        await syncPremiumRole(shopId, u.id).catch(() => null);
        setUserPremium(shopId, u.id, { ...p, ...{ roleRemoved: true } } as NonNullable<ShopUser["premium"]>);
        await premiumDm(shopId, u.id, "expired").catch(() => null);
        expired++;
      }
      continue;
    }
    // 만료 3일 전 한 번 알림
    const left = new Date(p.expiresAt).getTime() - now;
    const remindKey = `soon:${p.expiresAt}`;
    if (left < 3 * 86_400_000 && (p as { reminded?: string }).reminded !== remindKey) {
      setUserPremium(shopId, u.id, { ...p, ...{ reminded: remindKey } } as NonNullable<ShopUser["premium"]>);
      await premiumDm(shopId, u.id, "soon").catch(() => null);
      await persistAsync();
    }
    const pts = PREMIUM_PLANS[p.plan].monthlyPoints;
    if (!pts) continue;
    const last = p.lastPointsAt ? new Date(p.lastPointsAt).getTime() : 0;
    if (last && now - last < PREMIUM_DAYS * 86_400_000) continue;
    addUserPoints(shopId, u.id, pts, `premium:${p.plan}:monthly`);
    setUserPremium(shopId, u.id, { ...p, lastPointsAt: new Date(now).toISOString() });
    granted++;
  }
  if (granted || expired) await persistAsync();
  return { granted, expired };
}
