/**
 * DOES 케어 — DOES 에서 산 마크 계정이 잠기거나 · 도난(회수) · 정지되면 보상해 주는 월 구독.
 *
 * 플랜
 *  - basic : 월 11,900P · 한 번 최대 40,000P 보상
 *  - plus  : 월 40,000P · 한 번 최대 130,000P 보상
 * 규칙
 *  - 포인트로 30일마다 자동 갱신 (포인트가 모자라면 갱신 실패 → 해지)
 *  - 가입 후 7일 동안은 대기 기간 (그 뒤에 생긴 사고만 보상)
 *  - 보상은 30일에 한 번, DOES 에서 산 마크 계정만
 *  - 해지해도 이미 낸 기간이 끝날 때까지는 보장
 *
 * 구독 · 보상 신청은 KV(care:v1:<shopId>) 에 둔다.
 */
import { randomUUID } from "crypto";
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";

export const CARE_PLANS = {
  basic: { id: "basic", name: "DOES 케어 베이직", price: 11_900, maxPayout: 40_000 },
  plus: { id: "plus", name: "DOES 케어 플러스", price: 40_000, maxPayout: 130_000 },
} as const;
export type CarePlanId = keyof typeof CARE_PLANS;
export const CARE_PERIOD_DAYS = 30;
export const CARE_WAIT_DAYS = 7;
export const CARE_CLAIM_COOLDOWN_DAYS = 30;
export const CLAIM_TYPES = { lock: "계정 잠금", theft: "도난 · 회수", ban: "정지(밴)" } as const;
export type ClaimType = keyof typeof CLAIM_TYPES;

export type CareSub = {
  userId: string;
  discordId: string | null;
  plan: CarePlanId;
  status: "active" | "cancelled" | "lapsed";
  startedAt: string;
  /** 보상 대상이 되는 시점 (가입 + 7일) */
  coveredFrom: string;
  periodEnd: string;
  autoRenew: boolean;
  lastChargedAt: string;
};

export type CareClaim = {
  id: string;
  userId: string;
  discordId: string | null;
  plan: CarePlanId;
  orderId: string;
  productName: string;
  paidAmount: number;
  type: ClaimType;
  description: string;
  status: "pending" | "approved" | "rejected";
  payout: number | null;
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
  adminCard: { channelId: string; messageId: string } | null;
};

type Db = { subs: CareSub[]; claims: CareClaim[] };
const key = (shopId: string) => `care:v1:${shopId}`;
const DAY = 86_400_000;

export async function getCareDb(shopId: string): Promise<Db> {
  return (await kvGetJson<Db>(key(shopId))) ?? { subs: [], claims: [] };
}
async function mutate<T>(shopId: string, fn: (db: Db) => T): Promise<T> {
  return withLock(key(shopId), async () => {
    const db = await getCareDb(shopId);
    const out = fn(db);
    db.claims = db.claims.slice(0, 3000);
    await kvPutJson(key(shopId), db);
    return out;
  });
}

/** 지금 보장 중인지 (해지했어도 기간 안이면 보장) */
export function isCovered(sub: CareSub | null | undefined, at = Date.now()) {
  return Boolean(sub && sub.status !== "lapsed" && Date.parse(sub.periodEnd) > at);
}

export async function getMyCare(shopId: string, userId: string) {
  const db = await getCareDb(shopId);
  const sub = db.subs.find((s) => s.userId === userId) ?? null;
  const claims = db.claims.filter((c) => c.userId === userId).slice(0, 20);
  return { sub, claims };
}

/** 가입 · 플랜 변경 — 첫 달 포인트를 바로 낸다 */
export async function subscribeCare(shopId: string, user: { id: string; discordId: string | null }, planId: CarePlanId) {
  const plan = CARE_PLANS[planId];
  if (!plan) throw new Error("플랜을 골라 주세요.");
  const { changeUserPoints } = await import("@/lib/store");
  const cur = (await getCareDb(shopId)).subs.find((s) => s.userId === user.id);
  if (cur && isCovered(cur) && cur.plan === planId && cur.autoRenew) throw new Error("이미 이 플랜을 쓰고 있어요.");
  // 이미 보장 중이면 남은 기간을 다시 사지 않고 플랜 · 자동 갱신만 바꾼다 (다음 결제부터 새 가격)
  if (cur && isCovered(cur)) {
    return mutate(shopId, (db) => {
      const s = db.subs.find((x) => x.userId === user.id)!;
      s.plan = planId;
      s.autoRenew = true;
      s.status = "active";
      return { sub: { ...s }, charged: 0, balance: null as number | null };
    });
  }
  const paid = changeUserPoints(shopId, user.id, -plan.price, "care.subscribe", { plan: planId, price: plan.price });
  if (!paid.ok) throw new Error(paid.balance !== undefined ? `포인트가 부족해요. 필요 ${plan.price.toLocaleString("ko-KR")}P · 보유 ${paid.balance.toLocaleString("ko-KR")}P` : paid.error);
  const now = Date.now();
  const sub: CareSub = {
    userId: user.id,
    discordId: user.discordId,
    plan: planId,
    status: "active",
    startedAt: new Date(now).toISOString(),
    coveredFrom: new Date(now + CARE_WAIT_DAYS * DAY).toISOString(),
    periodEnd: new Date(now + CARE_PERIOD_DAYS * DAY).toISOString(),
    autoRenew: true,
    lastChargedAt: new Date(now).toISOString(),
  };
  try {
    await mutate(shopId, (db) => {
      db.subs = db.subs.filter((s) => s.userId !== user.id);
      db.subs.push(sub);
    });
  } catch (e) {
    changeUserPoints(shopId, user.id, plan.price, "care.refund", { why: "save_failed" });
    throw e;
  }
  return { sub, charged: plan.price, balance: paid.balance };
}

/** 해지 — 자동 갱신만 끈다 (남은 기간은 보장) */
export async function cancelCare(shopId: string, userId: string) {
  return mutate(shopId, (db) => {
    const s = db.subs.find((x) => x.userId === userId);
    if (!s || !isCovered(s)) throw new Error("이용 중인 케어가 없어요.");
    s.autoRenew = false;
    s.status = "cancelled";
    return { ...s };
  });
}

/** 보상 신청 가능한 내 주문 (DOES 에서 산 마크 계정) */
export async function claimableOrders(shopId: string, userId: string) {
  const { getStoreForRead } = await import("@/lib/store");
  const st = getStoreForRead();
  const byId = new Map(st.products.filter((p) => p.shopId === shopId).map((p) => [p.id, p]));
  return st.orders
    .filter((o) => o.shopId === shopId && o.userId === userId && o.paidAt && ["paid", "dispensed", "awaiting_fulfillment"].includes(o.status))
    .filter((o) => byId.get(o.productId)?.productKind === "mc_account")
    .sort((a, b) => Date.parse(b.paidAt!) - Date.parse(a.paidAt!))
    .slice(0, 30)
    .map((o) => ({ id: o.id, productName: byId.get(o.productId)?.mcMaskedName || byId.get(o.productId)?.name || "마크 계정", amount: o.amount, paidAt: o.paidAt! }));
}

export async function fileClaim(shopId: string, user: { id: string; discordId: string | null }, input: { orderId: string; type: ClaimType; description: string }) {
  const db = await getCareDb(shopId);
  const sub = db.subs.find((s) => s.userId === user.id);
  if (!isCovered(sub)) throw new Error("DOES 케어 이용 중일 때만 보상을 신청할 수 있어요.");
  if (Date.now() < Date.parse(sub!.coveredFrom)) {
    throw new Error(`가입 후 ${CARE_WAIT_DAYS}일 대기 기간이에요. ${new Date(sub!.coveredFrom).toLocaleDateString("ko-KR")}부터 신청할 수 있어요.`);
  }
  if (!(input.type in CLAIM_TYPES)) throw new Error("사유를 골라 주세요.");
  const description = input.description.replace(/\s+/g, " ").trim().slice(0, 600);
  if (description.length < 10) throw new Error("무슨 일이 있었는지 조금 더 자세히 적어 주세요.");
  const mine = db.claims.filter((c) => c.userId === user.id);
  if (mine.some((c) => c.status === "pending")) throw new Error("심사 중인 신청이 있어요. 결과가 나온 뒤 다시 신청해 주세요.");
  const lastApproved = mine.filter((c) => c.status === "approved").sort((a, b) => Date.parse(b.decidedAt ?? b.createdAt) - Date.parse(a.decidedAt ?? a.createdAt))[0];
  if (lastApproved && Date.now() - Date.parse(lastApproved.decidedAt ?? lastApproved.createdAt) < CARE_CLAIM_COOLDOWN_DAYS * DAY) {
    throw new Error(`보상은 ${CARE_CLAIM_COOLDOWN_DAYS}일에 한 번까지예요.`);
  }
  if (mine.some((c) => c.orderId === input.orderId && c.status === "approved")) throw new Error("이 계정은 이미 보상을 받았어요.");
  const order = (await claimableOrders(shopId, user.id)).find((o) => o.id === input.orderId);
  if (!order) throw new Error("DOES 에서 산 마크 계정만 보상받을 수 있어요.");
  const claim: CareClaim = {
    id: `cc_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
    userId: user.id,
    discordId: user.discordId,
    plan: sub!.plan,
    orderId: order.id,
    productName: order.productName,
    paidAmount: order.amount,
    type: input.type,
    description,
    status: "pending",
    payout: null,
    reason: null,
    createdAt: new Date().toISOString(),
    decidedAt: null,
    adminCard: null,
  };
  await mutate(shopId, (d) => d.claims.unshift(claim));
  return claim;
}

/** 관리자 승인 — 플랜 최대 보상액 · 산 가격 중 작은 값까지 포인트로 */
export async function decideClaim(shopId: string, id: string, approve: boolean, amount: number | null, reason: string) {
  const { changeUserPoints } = await import("@/lib/store");
  return mutate(shopId, (db) => {
    const c = db.claims.find((x) => x.id === id);
    if (!c) throw new Error("보상 신청을 찾을 수 없어요.");
    if (c.status !== "pending") throw new Error("이미 처리된 신청이에요.");
    if (approve) {
      const cap = Math.min(CARE_PLANS[c.plan].maxPayout, c.paidAmount || CARE_PLANS[c.plan].maxPayout);
      const pay = Math.min(cap, Math.max(0, Math.floor(Number(amount ?? cap))));
      if (!(pay > 0)) throw new Error("보상 금액을 확인해 주세요.");
      const r = changeUserPoints(shopId, c.userId, pay, "care.payout", { claimId: c.id, amount: pay });
      if (!r.ok) throw new Error(r.error);
      c.status = "approved";
      c.payout = pay;
    } else {
      c.status = "rejected";
    }
    c.reason = reason.trim().slice(0, 300) || null;
    c.decidedAt = new Date().toISOString();
    return { ...c };
  });
}

export async function setClaimCard(shopId: string, id: string, card: { channelId: string; messageId: string }) {
  return mutate(shopId, (db) => {
    const c = db.claims.find((x) => x.id === id);
    if (c) c.adminCard = card;
  });
}

/** 크론 — 기간이 끝난 구독을 갱신(포인트 결제)하거나 끝낸다 */
export async function renewCare(shopId: string) {
  const db = await getCareDb(shopId);
  const now = Date.now();
  if (!db.subs.some((s) => s.status !== "lapsed" && Date.parse(s.periodEnd) <= now)) return [];
  const { changeUserPoints } = await import("@/lib/store");
  const events: { sub: CareSub; result: "renewed" | "lapsed" | "ended" }[] = [];
  await mutate(shopId, (d) => {
    for (const s of d.subs) {
      if (s.status === "lapsed" || Date.parse(s.periodEnd) > now) continue;
      if (!s.autoRenew || s.status === "cancelled") {
        s.status = "lapsed";
        events.push({ sub: { ...s }, result: "ended" });
        continue;
      }
      const plan = CARE_PLANS[s.plan];
      const r = changeUserPoints(shopId, s.userId, -plan.price, "care.renew", { plan: s.plan, price: plan.price });
      if (r.ok) {
        s.lastChargedAt = new Date(now).toISOString();
        s.periodEnd = new Date(Math.max(now, Date.parse(s.periodEnd)) + CARE_PERIOD_DAYS * DAY).toISOString();
        events.push({ sub: { ...s }, result: "renewed" });
      } else {
        s.status = "lapsed";
        s.autoRenew = false;
        events.push({ sub: { ...s }, result: "lapsed" });
      }
    }
  });
  return events;
}
