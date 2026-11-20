/**
 * 구해드림 — 손님이 원하는 계정을 조건 · 예산 · 기한으로 주문하고 선금을 건다.
 *
 * open      : 접수 (선금 차감됨) — 손님이 취소하면 선금 전액 환불
 * accepted  : 관리자가 수락 — 구하는 중
 * offered   : 관리자가 구해서 최종가 · 계정 정보를 넣음 — 손님이 남은 금액을 내면 받는다
 * fulfilled : 손님이 잔금까지 내고 계정 정보를 받음
 * refunded  : 기한이 지나거나 거절돼 선금 환불
 * cancelled : 수락 전 손님이 취소 (선금 환불)
 * expired   : 납품 후 48시간 안에 잔금을 안 냄 (선금은 돌려주지 않음)
 *
 * 목록은 KV(gugo:v1:<shopId>) — 상점 DB 를 키우지 않게.
 */
import { randomUUID } from "crypto";
import { changeUserPoints } from "@/lib/store";
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";

export const GUGO_DEPOSIT_PERCENT = 30;
export const GUGO_MIN_BUDGET = 10_000;
export const GUGO_MAX_BUDGET = 5_000_000;
export const GUGO_DEADLINES = [3, 7, 14] as const;
/** 납품 후 잔금을 기다리는 시간 */
export const GUGO_PAY_WINDOW_MS = 48 * 3_600_000;

export type GugoStatus = "open" | "accepted" | "offered" | "fulfilled" | "refunded" | "cancelled" | "expired";

export type GugoRequest = {
  id: string;
  shopId: string;
  userId: string;
  discordId: string | null;
  wish: string;
  budget: number;
  deposit: number;
  deadlineDays: number;
  deadline: string;
  status: GugoStatus;
  createdAt: string;
  acceptedAt: string | null;
  offeredAt: string | null;
  /** 최종가 (선금 포함 총액) */
  finalPrice: number | null;
  /** 손님에게 줄 계정 정보 (코드 · 로그인 정보 등) — 잔금을 내야 보인다 */
  delivery: string | null;
  offerNote: string | null;
  paidAt: string | null;
  closedReason: string | null;
  adminCard: { channelId: string; messageId: string } | null;
};

const key = (shopId: string) => `gugo:v1:${shopId}`;

export async function listGugo(shopId: string) {
  return (await kvGetJson<GugoRequest[]>(key(shopId))) ?? [];
}

export async function getGugo(shopId: string, id: string) {
  return (await listGugo(shopId)).find((r) => r.id === id) ?? null;
}

async function mutate<T>(shopId: string, fn: (list: GugoRequest[]) => T): Promise<T> {
  return withLock(key(shopId), async () => {
    const list = await listGugo(shopId);
    const out = fn(list);
    await kvPutJson(key(shopId), list.slice(0, 2000));
    return out;
  });
}

function find(list: GugoRequest[], id: string) {
  const r = list.find((x) => x.id === id);
  if (!r) throw new Error("구해드림 주문을 찾을 수 없어요.");
  return r;
}

export function depositFor(budget: number) {
  return Math.ceil((budget * GUGO_DEPOSIT_PERCENT) / 100 / 100) * 100;
}

/** 손님 주문 — 선금을 바로 뺀다 */
export async function createGugo(shopId: string, user: { id: string; discordId: string | null }, input: { wish: string; budget: number; deadlineDays: number }) {
  const wish = input.wish.replace(/\s+/g, " ").trim().slice(0, 300);
  if (wish.length < 4) throw new Error("원하는 계정 조건을 조금 더 자세히 적어 주세요.");
  const budget = Math.floor(Number(input.budget));
  if (!(budget >= GUGO_MIN_BUDGET && budget <= GUGO_MAX_BUDGET)) {
    throw new Error(`예산은 ${GUGO_MIN_BUDGET.toLocaleString("ko-KR")}원 ~ ${GUGO_MAX_BUDGET.toLocaleString("ko-KR")}원 사이로 적어 주세요.`);
  }
  const days = (GUGO_DEADLINES as readonly number[]).includes(input.deadlineDays) ? input.deadlineDays : 7;
  const deposit = depositFor(budget);
  const now = Date.now();
  const req: GugoRequest = {
    id: `gg_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
    shopId,
    userId: user.id,
    discordId: user.discordId,
    wish,
    budget,
    deposit,
    deadlineDays: days,
    deadline: new Date(now + days * 86_400_000).toISOString(),
    status: "open",
    createdAt: new Date(now).toISOString(),
    acceptedAt: null,
    offeredAt: null,
    finalPrice: null,
    delivery: null,
    offerNote: null,
    paidAt: null,
    closedReason: null,
    adminCard: null,
  };
  const open = (await listGugo(shopId)).filter((r) => r.userId === user.id && ["open", "accepted", "offered"].includes(r.status)).length;
  if (open >= 3) throw new Error("진행 중인 구해드림은 한 번에 3개까지예요.");
  const paid = changeUserPoints(shopId, user.id, -deposit, "gugo.deposit", { gugoId: req.id, budget, deposit });
  if (!paid.ok) {
    throw new Error(paid.balance !== undefined ? `포인트가 부족해요. 선금 ${deposit.toLocaleString("ko-KR")}P · 보유 ${paid.balance.toLocaleString("ko-KR")}P` : paid.error);
  }
  try {
    await mutate(shopId, (list) => list.unshift(req));
  } catch (e) {
    changeUserPoints(shopId, user.id, deposit, "gugo.refund", { gugoId: req.id, deposit, why: "save_failed" });
    throw e;
  }
  return { ...req, balance: paid.balance };
}

function refundDeposit(r: GugoRequest, why: string) {
  const res = changeUserPoints(r.shopId, r.userId, r.deposit, "gugo.refund", { gugoId: r.id, deposit: r.deposit, why });
  return res.ok;
}

/** 손님 취소 — 수락 전에만 (선금 환불) */
export async function cancelGugo(shopId: string, id: string, userId: string) {
  return mutate(shopId, (list) => {
    const r = find(list, id);
    if (r.userId !== userId) throw new Error("내 주문만 취소할 수 있어요.");
    if (r.status !== "open") throw new Error("관리자가 이미 수락해서 취소할 수 없어요. 기한 안에 못 구하면 자동으로 환불돼요.");
    r.status = "cancelled";
    r.closedReason = "손님 취소";
    refundDeposit(r, "cancel");
    return { ...r };
  });
}

export async function acceptGugo(shopId: string, id: string) {
  return mutate(shopId, (list) => {
    const r = find(list, id);
    if (r.status !== "open") throw new Error("이미 처리된 주문이에요.");
    r.status = "accepted";
    r.acceptedAt = new Date().toISOString();
    return { ...r };
  });
}

/** 관리자 거절 — 선금 환불 */
export async function rejectGugo(shopId: string, id: string, reason: string) {
  return mutate(shopId, (list) => {
    const r = find(list, id);
    if (!["open", "accepted"].includes(r.status)) throw new Error("이미 처리된 주문이에요.");
    r.status = "refunded";
    r.closedReason = reason || "관리자 거절";
    refundDeposit(r, "reject");
    return { ...r };
  });
}

/** 관리자 납품 — 최종가 · 계정 정보 입력 (손님이 잔금을 내야 정보가 보인다) */
export async function offerGugo(shopId: string, id: string, input: { finalPrice: number; delivery: string; note?: string }) {
  const finalPrice = Math.floor(Number(input.finalPrice));
  const delivery = input.delivery.trim().slice(0, 1500);
  if (!delivery) throw new Error("손님에게 줄 계정 정보를 적어 주세요.");
  return mutate(shopId, (list) => {
    const r = find(list, id);
    if (!["open", "accepted"].includes(r.status)) throw new Error("이미 처리된 주문이에요.");
    if (!(finalPrice >= r.deposit)) throw new Error(`최종가는 선금(${r.deposit.toLocaleString("ko-KR")}원) 이상이어야 해요.`);
    r.status = "offered";
    r.acceptedAt ??= new Date().toISOString();
    r.offeredAt = new Date().toISOString();
    r.finalPrice = finalPrice;
    r.delivery = delivery;
    r.offerNote = input.note?.trim().slice(0, 300) || null;
    return { ...r };
  });
}

/** 손님 잔금 결제 → 계정 정보 공개 */
export async function payGugo(shopId: string, id: string, userId: string) {
  return mutate(shopId, (list) => {
    const r = find(list, id);
    if (r.userId !== userId) throw new Error("내 주문만 결제할 수 있어요.");
    if (r.status !== "offered" || r.finalPrice === null) throw new Error("아직 결제할 수 있는 상태가 아니에요.");
    const rest = Math.max(0, r.finalPrice - r.deposit);
    if (rest > 0) {
      const paid = changeUserPoints(shopId, userId, -rest, "gugo.pay", { gugoId: r.id, rest, finalPrice: r.finalPrice });
      if (!paid.ok) {
        throw new Error(paid.balance !== undefined ? `포인트가 부족해요. 잔금 ${rest.toLocaleString("ko-KR")}P · 보유 ${paid.balance.toLocaleString("ko-KR")}P` : paid.error);
      }
    }
    r.status = "fulfilled";
    r.paidAt = new Date().toISOString();
    return { ...r, rest };
  });
}

/** 크론 — 기한 지난 주문 환불 · 잔금 안 낸 납품 만료 */
export async function sweepGugo(shopId: string) {
  const now = Date.now();
  const changed: GugoRequest[] = [];
  const list = await listGugo(shopId);
  if (!list.some((r) => (["open", "accepted"].includes(r.status) && Date.parse(r.deadline) < now) || (r.status === "offered" && r.offeredAt && Date.parse(r.offeredAt) + GUGO_PAY_WINDOW_MS < now))) return changed;
  await mutate(shopId, (all) => {
    for (const r of all) {
      if (["open", "accepted"].includes(r.status) && Date.parse(r.deadline) < now) {
        r.status = "refunded";
        r.closedReason = "기한 안에 구하지 못해 자동 환불";
        refundDeposit(r, "deadline");
        changed.push({ ...r });
      } else if (r.status === "offered" && r.offeredAt && Date.parse(r.offeredAt) + GUGO_PAY_WINDOW_MS < now) {
        r.status = "expired";
        r.closedReason = "납품 후 48시간 안에 잔금을 내지 않음";
        changed.push({ ...r });
      }
    }
  });
  return changed;
}

export async function setGugoAdminCard(shopId: string, id: string, card: { channelId: string; messageId: string }) {
  return mutate(shopId, (list) => {
    const r = find(list, id);
    r.adminCard = card;
    return { ...r };
  });
}

/** 손님에게 보여 줄 모양 — 잔금을 내기 전엔 계정 정보를 숨긴다 */
export function publicGugo(r: GugoRequest) {
  return {
    id: r.id,
    wish: r.wish,
    budget: r.budget,
    deposit: r.deposit,
    deadline: r.deadline,
    status: r.status,
    createdAt: r.createdAt,
    finalPrice: r.finalPrice,
    rest: r.finalPrice !== null ? Math.max(0, r.finalPrice - r.deposit) : null,
    offerNote: r.offerNote,
    delivery: r.status === "fulfilled" ? r.delivery : null,
    closedReason: r.closedReason,
    payBy: r.status === "offered" && r.offeredAt ? new Date(Date.parse(r.offeredAt) + GUGO_PAY_WINDOW_MS).toISOString() : null,
  };
}
