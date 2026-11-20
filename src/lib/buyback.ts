/**
 * 계정 매입 · 보상판매
 *
 * submitted : 손님 신청 (공개 정보로 자동 감정한 예상가 범위 포함)
 * offered   : 관리자가 검수 후 매입가 제시 → 손님 수락/거절
 * accepted  : 손님 수락 → 로그인 정보 제출 대기
 * handover  : 손님이 로그인 정보 제출 (암호화 저장, 관리자만 열람) → 관리자 확인
 * completed : 관리자 완료 → 포인트 지급 / 현금 송금 처리 / 보상판매면 새 계정 자동 구매
 * rejected · cancelled : 끝
 *
 * 보상판매(tradein)는 매입가에 +5% 보너스를 얹어 포인트로 준 뒤, 고른 판매 계정을 자동으로 산다.
 * 로그인 정보 · 계좌 정보는 서버 비밀키로 암호화해 저장하고 완료되면 지운다.
 */
import { randomUUID } from "crypto";
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";
import { encryptSecret, decryptSecret } from "@/lib/verify-bot/crypto";

export const BUYBACK_LOW = 0.5;
export const BUYBACK_HIGH = 0.65;
export const TRADEIN_BONUS_PERCENT = 5;

export type BuybackStatus = "submitted" | "offered" | "accepted" | "handover" | "completed" | "rejected" | "cancelled";

export type Appraisal = {
  ok: boolean;
  nickname: string;
  uuid: string | null;
  capes: { type: string; title: string }[];
  hypixel: { rank: string | null; level: number; bedwarsStars: number } | null;
  market: number | null;
  low: number | null;
  high: number | null;
  basis: string[];
};

export type Buyback = {
  id: string;
  shopId: string;
  userId: string;
  discordId: string | null;
  kind: "buyback" | "tradein";
  appraisal: Appraisal;
  payout: "points" | "cash";
  /** 현금일 때 계좌 (암호화) */
  bankEnc: string | null;
  targetProductId: string | null;
  note: string | null;
  offerPrice: number | null;
  offerNote: string | null;
  /** 로그인 정보 (암호화) — 완료되면 지운다 */
  credEnc: string | null;
  status: BuybackStatus;
  createdAt: string;
  offeredAt: string | null;
  acceptedAt: string | null;
  handoverAt: string | null;
  completedAt: string | null;
  closedReason: string | null;
  result: string | null;
  adminCard: { channelId: string; messageId: string } | null;
};

const key = (shopId: string) => `buyback:v1:${shopId}`;

export async function listBuybacks(shopId: string) {
  return (await kvGetJson<Buyback[]>(key(shopId))) ?? [];
}
export async function getBuyback(shopId: string, id: string) {
  return (await listBuybacks(shopId)).find((b) => b.id === id) ?? null;
}
async function mutate<T>(shopId: string, fn: (list: Buyback[]) => T): Promise<T> {
  return withLock(key(shopId), async () => {
    const list = await listBuybacks(shopId);
    const out = fn(list);
    await kvPutJson(key(shopId), list.slice(0, 2000));
    return out;
  });
}
function find(list: Buyback[], id: string) {
  const b = list.find((x) => x.id === id);
  if (!b) throw new Error("매입 신청을 찾을 수 없어요.");
  return b;
}

const round1000 = (n: number) => Math.max(0, Math.round(n / 1000) * 1000);

/** 공개 정보 + 계정 차트 시세로 예상 매입가 범위를 계산한다 */
export async function appraiseAccount(shopId: string, nicknameRaw: string): Promise<Appraisal> {
  const nickname = nicknameRaw.trim();
  const empty: Appraisal = { ok: false, nickname, uuid: null, capes: [], hypixel: null, market: null, low: null, high: null, basis: [] };
  if (!/^[A-Za-z0-9_]{3,16}$/.test(nickname)) return empty;
  const [{ resolveMcProfile }, { CAPE_BY_HASH, CAPE_BY_TYPE }, { getMarketHistory }] = await Promise.all([
    import("@/lib/mc-profile-server"),
    import("@/lib/capes-data"),
    import("@/lib/market-index"),
  ]);
  const profile = await resolveMcProfile(nickname).catch(() => null);
  if (!profile?.uuid) return empty;
  const capes = (profile.capes ?? [])
    .map((c) => {
      const byHash = c.hash ? CAPE_BY_HASH[c.hash] : undefined;
      return byHash ? { type: byHash.type, title: byHash.title } : c.title ? { type: c.title.toLowerCase(), title: c.title } : null;
    })
    .filter((c): c is { type: string; title: string } => Boolean(c));

  let hypixel: Appraisal["hypixel"] = null;
  try {
    const { hypixelConfigured, hypixelStats } = await import("@/lib/world/minecraft");
    if (await hypixelConfigured()) {
      const h = await hypixelStats(profile.uuid);
      if (h) hypixel = { rank: h.rank, level: h.level, bedwarsStars: h.bedwars?.stars ?? 0 };
    }
  } catch {
    hypixel = null;
  }

  const hist = await getMarketHistory(shopId);
  const today = hist[hist.length - 1]?.groups ?? {};
  const basis: string[] = [];
  let market = 0;
  for (const c of capes) {
    const g = today[`cape:${c.type}`];
    if (g?.avg && g.avg > market) {
      market = g.avg;
      basis.push(`${CAPE_BY_TYPE[c.type]?.title ?? c.title} 망토 계정 평균 ${g.avg.toLocaleString("ko-KR")}원`);
    }
  }
  // 시세에 없는 망토(희귀 망토)를 가졌으면 평균으로 깎아 부르지 않고 관리자가 직접 감정한다
  const unpriced = capes.filter((c) => c.type !== "optifine" && !today[`cape:${c.type}`]?.avg);
  if (unpriced.length) {
    return {
      ok: true,
      nickname: profile.name,
      uuid: profile.uuid,
      capes,
      hypixel,
      market: market || null,
      low: null,
      high: null,
      basis: [`시세에 없는 망토 보유 (${unpriced.map((c) => c.title).join(", ")}) — 관리자가 직접 감정해요`],
    };
  }
  if (!market) {
    const g = today["cat:일반 계정"] ?? today.all;
    if (g?.avg) {
      market = g.avg;
      basis.push(`일반 계정 평균 ${g.avg.toLocaleString("ko-KR")}원`);
    }
  }
  if (!market) return { ok: true, nickname: profile.name, uuid: profile.uuid, capes, hypixel, market: null, low: null, high: null, basis: ["시세 데이터가 부족해 관리자가 직접 감정해요"] };

  let bonus = 0;
  const rank = (hypixel?.rank ?? "").toUpperCase();
  if (rank.includes("MVP++")) (bonus += 0.15), basis.push("하이픽셀 MVP++ +15%");
  else if (rank.includes("MVP+")) (bonus += 0.1), basis.push("하이픽셀 MVP+ +10%");
  else if (rank.includes("MVP") || rank.includes("VIP")) (bonus += 0.05), basis.push(`하이픽셀 ${hypixel?.rank} +5%`);
  const stars = hypixel?.bedwarsStars ?? 0;
  if (stars >= 1000) (bonus += 0.2), basis.push("베드워즈 1000성 이상 +20%");
  else if (stars >= 500) (bonus += 0.1), basis.push("베드워즈 500성 이상 +10%");
  if (profile.name.length <= 4) (bonus += 0.15), basis.push("짧은 닉네임 +15%");

  const est = market * (1 + bonus);
  return {
    ok: true,
    nickname: profile.name,
    uuid: profile.uuid,
    capes,
    hypixel,
    market,
    low: round1000(est * BUYBACK_LOW),
    high: round1000(est * BUYBACK_HIGH),
    basis,
  };
}

export async function createBuyback(
  shopId: string,
  user: { id: string; discordId: string | null },
  input: { nickname: string; kind: "buyback" | "tradein"; payout: "points" | "cash"; bank?: { name: string; account: string; holder: string } | null; targetProductId?: string | null; note?: string },
) {
  const list = await listBuybacks(shopId);
  if (list.filter((b) => b.userId === user.id && ["submitted", "offered", "accepted", "handover"].includes(b.status)).length >= 3) {
    throw new Error("진행 중인 매입 신청은 한 번에 3개까지예요.");
  }
  if (list.some((b) => ["submitted", "offered", "accepted", "handover"].includes(b.status) && b.appraisal.nickname.toLowerCase() === input.nickname.trim().toLowerCase())) {
    throw new Error("이 계정은 이미 매입 신청이 진행 중이에요.");
  }
  const appraisal = await appraiseAccount(shopId, input.nickname);
  if (!appraisal.ok) throw new Error("마인크래프트 정품 계정을 찾지 못했어요. 닉네임을 확인해 주세요.");
  const kind = input.kind === "tradein" ? "tradein" : "buyback";
  let targetProductId: string | null = null;
  if (kind === "tradein") {
    const { getProductById } = await import("@/lib/store");
    const p = input.targetProductId ? getProductById(input.targetProductId) : null;
    if (!p || !p.active || p.shopId !== shopId) throw new Error("바꿀 계정(판매 상품)을 골라 주세요.");
    targetProductId = p.id;
  }
  const payout = kind === "tradein" ? "points" : input.payout === "cash" ? "cash" : "points";
  let bankEnc: string | null = null;
  if (payout === "cash") {
    const b = input.bank;
    if (!b?.name?.trim() || !b.account?.trim() || !b.holder?.trim()) throw new Error("현금으로 받으려면 은행 · 계좌번호 · 예금주를 적어 주세요.");
    bankEnc = encryptSecret(JSON.stringify({ name: b.name.trim().slice(0, 30), account: b.account.trim().slice(0, 40), holder: b.holder.trim().slice(0, 30) }));
  }
  const b: Buyback = {
    id: `bb_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
    shopId,
    userId: user.id,
    discordId: user.discordId,
    kind,
    appraisal,
    payout,
    bankEnc,
    targetProductId,
    note: input.note?.trim().slice(0, 300) || null,
    offerPrice: null,
    offerNote: null,
    credEnc: null,
    status: "submitted",
    createdAt: new Date().toISOString(),
    offeredAt: null,
    acceptedAt: null,
    handoverAt: null,
    completedAt: null,
    closedReason: null,
    result: null,
    adminCard: null,
  };
  await mutate(shopId, (l) => l.unshift(b));
  return b;
}

export async function offerBuyback(shopId: string, id: string, price: number, note: string) {
  const p = Math.floor(Number(price));
  if (!(p > 0)) throw new Error("매입가를 숫자로 적어 주세요.");
  return mutate(shopId, (l) => {
    const b = find(l, id);
    if (!["submitted", "offered"].includes(b.status)) throw new Error("이미 처리된 신청이에요.");
    b.status = "offered";
    b.offerPrice = p;
    b.offerNote = note.trim().slice(0, 300) || null;
    b.offeredAt = new Date().toISOString();
    return { ...b };
  });
}

/** 손님: 제시가 수락 / 거절 */
export async function respondBuyback(shopId: string, id: string, userId: string, accept: boolean) {
  return mutate(shopId, (l) => {
    const b = find(l, id);
    if (b.userId !== userId) throw new Error("내 신청만 처리할 수 있어요.");
    if (b.status !== "offered") throw new Error("지금은 응답할 수 없는 상태예요.");
    if (accept) {
      b.status = "accepted";
      b.acceptedAt = new Date().toISOString();
    } else {
      b.status = "cancelled";
      b.closedReason = "손님이 제시가를 거절";
    }
    return { ...b };
  });
}

/** 손님: 로그인 정보 제출 (암호화) */
export async function handoverBuyback(shopId: string, id: string, userId: string, cred: { email: string; password: string; extra?: string }) {
  const email = cred.email.trim();
  const password = cred.password;
  if (!email || !password) throw new Error("로그인 이메일과 비밀번호를 모두 적어 주세요.");
  return mutate(shopId, (l) => {
    const b = find(l, id);
    if (b.userId !== userId) throw new Error("내 신청만 처리할 수 있어요.");
    if (!["accepted", "handover"].includes(b.status)) throw new Error("지금은 로그인 정보를 낼 수 없는 상태예요.");
    b.credEnc = encryptSecret(JSON.stringify({ email: email.slice(0, 120), password: password.slice(0, 200), extra: (cred.extra ?? "").trim().slice(0, 500) }));
    b.status = "handover";
    b.handoverAt = new Date().toISOString();
    return { ...b };
  });
}

export async function cancelBuyback(shopId: string, id: string, userId: string) {
  return mutate(shopId, (l) => {
    const b = find(l, id);
    if (b.userId !== userId) throw new Error("내 신청만 취소할 수 있어요.");
    if (!["submitted", "offered", "accepted"].includes(b.status)) throw new Error("지금은 취소할 수 없어요. 관리자에게 문의해 주세요.");
    b.status = "cancelled";
    b.closedReason = "손님 취소";
    b.credEnc = null;
    return { ...b };
  });
}

export async function rejectBuyback(shopId: string, id: string, reason: string) {
  return mutate(shopId, (l) => {
    const b = find(l, id);
    if (["completed", "rejected", "cancelled"].includes(b.status)) throw new Error("이미 끝난 신청이에요.");
    b.status = "rejected";
    b.closedReason = reason.trim().slice(0, 300) || "관리자 반려";
    b.credEnc = null;
    return { ...b };
  });
}

/** 관리자 전용 — 로그인 정보 · 계좌 보기 */
export function revealBuyback(b: Buyback) {
  const parse = (enc: string | null) => {
    if (!enc) return null;
    const t = decryptSecret(enc);
    try {
      return t ? (JSON.parse(t) as Record<string, string>) : null;
    } catch {
      return null;
    }
  };
  return { cred: parse(b.credEnc), bank: parse(b.bankEnc) };
}

/**
 * 관리자 완료 — 포인트 지급 (보상판매면 +5% 후 새 계정 자동 구매) · 현금은 송금했다는 표시만.
 * 로그인 정보는 지운다.
 */
export async function completeBuyback(shopId: string, id: string) {
  const b0 = await getBuyback(shopId, id);
  if (!b0) throw new Error("매입 신청을 찾을 수 없어요.");
  if (b0.status !== "handover") throw new Error("손님이 로그인 정보를 낸 뒤에 완료할 수 있어요.");
  if (!b0.offerPrice) throw new Error("매입가가 없어요.");
  const { changeUserPoints } = await import("@/lib/store");
  let result = "";
  if (b0.payout === "points") {
    const amount = b0.kind === "tradein" ? Math.round(b0.offerPrice * (1 + TRADEIN_BONUS_PERCENT / 100)) : b0.offerPrice;
    const r = changeUserPoints(shopId, b0.userId, amount, b0.kind === "tradein" ? "buyback.tradein" : "buyback.points", { buybackId: b0.id, amount });
    if (!r.ok) throw new Error(r.error);
    result = `${amount.toLocaleString("ko-KR")}P 지급`;
    if (b0.kind === "tradein" && b0.targetProductId) {
      const { purchaseWithPointsSmart } = await import("@/lib/mfa");
      const buy = await purchaseWithPointsSmart(shopId, b0.userId, b0.targetProductId).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "구매 실패" }));
      result += buy.ok ? " · 새 계정 자동 구매 완료" : ` · 새 계정 자동 구매 실패(${buy.error}) — 포인트는 그대로 있어요`;
    }
  } else {
    result = `현금 ${b0.offerPrice.toLocaleString("ko-KR")}원 송금 처리`;
  }
  return mutate(shopId, (l) => {
    const b = find(l, id);
    b.status = "completed";
    b.completedAt = new Date().toISOString();
    b.credEnc = null;
    b.bankEnc = null;
    b.result = result;
    return { ...b };
  });
}

export async function setBuybackAdminCard(shopId: string, id: string, card: { channelId: string; messageId: string }) {
  return mutate(shopId, (l) => {
    const b = find(l, id);
    b.adminCard = card;
    return { ...b };
  });
}

/** 손님에게 보여 줄 모양 (암호화 정보 없음) */
export function publicBuyback(b: Buyback) {
  return {
    id: b.id,
    kind: b.kind,
    nickname: b.appraisal.nickname,
    capes: b.appraisal.capes.map((c) => c.title),
    low: b.appraisal.low,
    high: b.appraisal.high,
    payout: b.payout,
    targetProductId: b.targetProductId,
    offerPrice: b.offerPrice,
    offerNote: b.offerNote,
    bonusPrice: b.kind === "tradein" && b.offerPrice ? Math.round(b.offerPrice * (1 + TRADEIN_BONUS_PERCENT / 100)) : null,
    status: b.status,
    createdAt: b.createdAt,
    closedReason: b.closedReason,
    result: b.result,
    credSubmitted: Boolean(b.credEnc) || b.status === "completed",
  };
}
