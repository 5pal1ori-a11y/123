/**
 * 프리미엄 플랜 (BASIC PASS · DOES PASS+) — 계좌이체라 라이선스 키로 지급한다.
 * 관리자가 키를 만들어 주면(또는 구매 후 자동 발급) 회원이 「프리미엄 플랜」 페이지에서 키를 넣어 30일 단위로 켠다.
 * 저장: KV premium:v1:<shopId> = { subs: {userId: Sub}, keys: {KEY: LicenseKey} }
 */
import { randomBytes } from "crypto";
import { RESALE_DEFAULT_FEE_PERCENT } from "@/lib/resale-shared";
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";

export type PremiumPlanId = "basic" | "plus";

export type PremiumPlan = {
  id: PremiumPlanId;
  name: string;
  price: number;
  tagline: string;
  perks: string[];
  /** 모든 상품 추가 할인 % */
  extraDiscountPercent: number;
  /** 다이아캐기 보상 배수 — fixed: 항상 이 배수 · random: 랜덤으로 2~max 배 */
  mine: { kind: "random"; chance: number; max: number } | { kind: "fixed"; multiplier: number };
  /** 대리판매 수수료 % */
  resaleFeePercent: number;
  /** 매월 지급 포인트 */
  monthlyPoints: number;
  /** 신규 상품 우선 구매 (분) */
  earlyAccessMinutes: number;
};

export const PREMIUM_PLANS: Record<PremiumPlanId, PremiumPlan> = {
  basic: {
    id: "basic",
    name: "BASIC PASS",
    price: 4900,
    tagline: "가볍게 시작하는 혜택",
    perks: [
      "디스코드 전용 역할",
      "다이아 캐기 랜덤 2배 ~ 최대 4배",
      "매달 1회 패스 구매자 전용 이벤트 참가",
      "모든 제품 3% 추가 할인",
    ],
    extraDiscountPercent: 3,
    mine: { kind: "random", chance: 0.3, max: 4 },
    resaleFeePercent: RESALE_DEFAULT_FEE_PERCENT,
    monthlyPoints: 0,
    earlyAccessMinutes: 0,
  },
  plus: {
    id: "plus",
    name: "DOES PASS+",
    price: 9900,
    tagline: "가장 많이 받는 프리미엄",
    perks: [
      "프리미엄 디스코드 역할",
      "다이아 캐기 보상 항상 2배",
      "모든 대상 제품 5% 추가 할인",
      "프리미엄 전용 월간 이벤트",
      "신규 상품 1시간 우선 구매",
      "대리판매 수수료 할인 (10% → 7%)",
      "매월 2,500원 포인트 지급",
    ],
    extraDiscountPercent: 5,
    mine: { kind: "fixed", multiplier: 2 },
    resaleFeePercent: 7,
    monthlyPoints: 2500,
    earlyAccessMinutes: 60,
  },
};

export const PREMIUM_DAYS = 30;

export type PremiumSub = {
  plan: PremiumPlanId;
  startedAt: string;
  expiresAt: string;
  /** 마지막으로 월 포인트를 준 시각 */
  lastPointsAt: string | null;
  keys: string[];
};

export type PremiumKey = {
  key: string;
  plan: PremiumPlanId;
  days: number;
  createdAt: string;
  note: string;
  usedBy: string | null;
  usedAt: string | null;
};

type Db = { subs: Record<string, PremiumSub>; keys: Record<string, PremiumKey> };

const kvKey = (shopId: string) => `premium:v1:${shopId}`;

export async function loadPremium(shopId: string): Promise<Db> {
  const d = await kvGetJson<Db>(kvKey(shopId));
  return { subs: d?.subs ?? {}, keys: d?.keys ?? {} };
}

async function mutate<T>(shopId: string, fn: (db: Db) => T) {
  return withLock(kvKey(shopId), async () => {
    const db = await loadPremium(shopId);
    const out = fn(db);
    await kvPutJson(kvKey(shopId), db);
    return out;
  });
}

export function activeSub(sub: PremiumSub | null | undefined): PremiumSub | null {
  return sub && new Date(sub.expiresAt).getTime() > Date.now() ? sub : null;
}

export async function getPremiumSub(shopId: string, userId: string | null | undefined) {
  if (!userId) return null;
  return activeSub((await loadPremium(shopId)).subs[userId]);
}

export async function premiumBenefits(shopId: string, userId: string | null | undefined) {
  const sub = await getPremiumSub(shopId, userId);
  const plan = sub ? PREMIUM_PLANS[sub.plan] : null;
  return {
    plan: plan?.id ?? null,
    planName: plan?.name ?? null,
    expiresAt: sub?.expiresAt ?? null,
    extraDiscountPercent: plan?.extraDiscountPercent ?? 0,
    resaleFeePercent: plan?.resaleFeePercent ?? RESALE_DEFAULT_FEE_PERCENT,
    earlyAccessMinutes: plan?.earlyAccessMinutes ?? 0,
    mine: plan?.mine ?? null,
  };
}

/** 다이아캐기 배수 — 보상을 받을 때 한 번 굴린다 */
export function rollMineMultiplier(mine: PremiumPlan["mine"] | null): number {
  if (!mine) return 1;
  if (mine.kind === "fixed") return mine.multiplier;
  if (Math.random() >= mine.chance) return 1;
  // 2배가 가장 잦고 최대 배수로 갈수록 드물게
  const r = Math.random();
  const span = mine.max - 1;
  return Math.min(mine.max, 2 + Math.floor(Math.pow(r, 2) * span));
}

function newKey() {
  const raw = randomBytes(10).toString("hex").toUpperCase().slice(0, 16);
  return raw.match(/.{4}/g)!.join("-");
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

/**
 * 키 사용 — 같은 플랜이면 남은 기간에 이어서 늘리고, 다른 플랜이면 지금부터 새로 시작한다.
 * (플러스 사용 중에 베이직 키를 넣으면 플러스 기간이 끝난 뒤가 아니라 바로 바뀌므로 막는다)
 */
export async function redeemPremiumKey(shopId: string, userId: string, rawKey: string) {
  const key = rawKey.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").match(/.{1,4}/g)?.join("-") ?? "";
  return mutate(shopId, (db) => {
    const k = db.keys[key];
    if (!k) throw new Error("없는 라이선스 키예요. 다시 확인해 주세요.");
    if (k.usedBy) throw new Error("이미 사용된 라이선스 키예요.");
    const now = Date.now();
    const cur = activeSub(db.subs[userId]);
    if (cur && cur.plan === "plus" && k.plan === "basic") {
      throw new Error("DOES PASS+ 사용 중에는 BASIC PASS 키를 쓸 수 없어요. 기간이 끝난 뒤에 넣어 주세요.");
    }
    const base = cur && cur.plan === k.plan ? new Date(cur.expiresAt).getTime() : now;
    const sub: PremiumSub = {
      plan: k.plan,
      startedAt: cur && cur.plan === k.plan ? cur.startedAt : new Date(now).toISOString(),
      expiresAt: new Date(base + k.days * 86_400_000).toISOString(),
      lastPointsAt: cur && cur.plan === k.plan ? cur.lastPointsAt : null,
      keys: [...(cur?.keys ?? []), key].slice(-24),
    };
    db.subs[userId] = sub;
    k.usedBy = userId;
    k.usedAt = new Date(now).toISOString();
    return { sub, plan: PREMIUM_PLANS[k.plan] };
  });
}

export async function setPremiumSub(shopId: string, userId: string, plan: PremiumPlanId | null, days: number) {
  return mutate(shopId, (db) => {
    if (!plan) {
      delete db.subs[userId];
      return null;
    }
    const now = Date.now();
    db.subs[userId] = {
      plan,
      startedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + days * 86_400_000).toISOString(),
      lastPointsAt: db.subs[userId]?.lastPointsAt ?? null,
      keys: db.subs[userId]?.keys ?? [],
    };
    return db.subs[userId];
  });
}

/** 월 포인트 지급 대상 — 마지막 지급(없으면 시작) 뒤 30일이 지난 활성 구독자 */
export async function takeMonthlyPointsDue(shopId: string) {
  return mutate(shopId, (db) => {
    const due: { userId: string; points: number }[] = [];
    const now = Date.now();
    for (const [userId, sub] of Object.entries(db.subs)) {
      if (!activeSub(sub)) continue;
      const pts = PREMIUM_PLANS[sub.plan].monthlyPoints;
      if (!pts) continue;
      const last = sub.lastPointsAt ? new Date(sub.lastPointsAt).getTime() : 0;
      if (last && now - last < PREMIUM_DAYS * 86_400_000) continue;
      sub.lastPointsAt = new Date(now).toISOString();
      due.push({ userId, points: pts });
    }
    return due;
  });
}
