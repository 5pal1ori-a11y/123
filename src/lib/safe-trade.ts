/**
 * 안전거래 링크 (에스크로) — DOES 밖에서 만난 사람끼리도 DOES 가 돈을 맡아 주는 거래.
 *
 * 1. 판매자: 상품명 · 가격 · 설명 · 계정 로그인 정보(암호화) · 정산 방법으로 링크 생성 → shop.도스.com/safe/<코드> 공유
 * 2. 구매자: 링크에서 포인트로 결제 → DOES 가 돈을 보관, 로그인 정보는 구매자에게 바로 전달
 * 3. 구매자 보호 24시간: [구매 확정] 하면 바로 정산 · [문제 신고] 하면 정산 보류 → 관리자가 정산 또는 환불
 * 4. 보호 시간이 끝나면 자동 정산 (포인트 자동 · 계좌는 관리자 카드로 송금)
 * 수수료 5% (DOES PASS+ 3%) 는 판매자 정산액에서 뺀다. 열린 링크는 7일 뒤 만료.
 */
import { MFA_SITE_ORIGIN } from "@/lib/domain";
import { decryptSecret, encryptSecret } from "@/lib/verify-bot/crypto";
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";

export const SAFE_FEE_PERCENT = 5;
export const SAFE_FEE_PERCENT_PLUS = 3;
export const SAFE_HOLD_HOURS = 24;
export const SAFE_OPEN_DAYS = 7;

export type SafeStatus = "open" | "paid" | "held" | "settling" | "done" | "refunded" | "cancelled" | "expired";
export type Cred = { email: string; password: string; extra?: string };

export type SafeTrade = {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerDiscordId: string | null;
  title: string;
  description: string;
  price: number;
  feePercent: number;
  payout: number;
  credEnc: string;
  payoutMethod: "points" | "bank";
  payoutAccount: string | null;
  status: SafeStatus;
  buyerId: string | null;
  buyerName: string | null;
  buyerDiscordId: string | null;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  holdUntil: string | null;
  doneAt: string | null;
  disputeReason: string | null;
  adminCard?: { channelId: string; messageId: string } | null;
};

type Db = { trades: SafeTrade[] };
const key = (shopId: string) => `safetrade:v1:${shopId}`;
const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

function newCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(b, (x) => A[x % A.length]).join("");
}

export async function getSafeDb(shopId: string): Promise<Db> {
  return (await kvGetJson<Db>(key(shopId))) ?? { trades: [] };
}
async function mutate<T>(shopId: string, fn: (db: Db) => T | Promise<T>) {
  return withLock(key(shopId), async () => {
    const db = await getSafeDb(shopId);
    const out = await fn(db);
    // 끝난 거래는 최근 500건만
    const closed = db.trades.filter((t) => ["done", "refunded", "cancelled", "expired"].includes(t.status));
    if (closed.length > 500) {
      const drop = new Set(closed.slice(500).map((t) => t.id));
      db.trades = db.trades.filter((t) => !drop.has(t.id));
    }
    await kvPutJson(key(shopId), db);
    return out;
  });
}

export function safeUrl(id: string) {
  return `${MFA_SITE_ORIGIN}/safe/${id}`;
}

export function tradeCred(t: Pick<SafeTrade, "credEnc">): Cred | null {
  const s = decryptSecret(t.credEnc);
  if (!s) return null;
  try {
    return JSON.parse(s) as Cred;
  } catch {
    return null;
  }
}
export function credText(c: Cred | null) {
  if (!c) return "로그인 정보를 불러오지 못했어요. 관리자에게 문의해 주세요.";
  return [`이메일: ${c.email}`, `비밀번호: ${c.password}`, c.extra ? `추가 정보: ${c.extra}` : ""].filter(Boolean).join("\n");
}

/** 누가 보느냐에 따라 보여줄 정보 (로그인 정보는 결제한 구매자에게만) */
export function viewTrade(t: SafeTrade, viewerId: string | null) {
  const role = viewerId && viewerId === t.sellerId ? "seller" : viewerId && viewerId === t.buyerId ? "buyer" : "guest";
  const expired = t.status === "open" && Date.parse(t.expiresAt) < Date.now();
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    price: t.price,
    sellerName: t.sellerName,
    status: expired ? ("expired" as SafeStatus) : t.status,
    createdAt: t.createdAt,
    expiresAt: t.expiresAt,
    paidAt: t.paidAt,
    holdUntil: t.holdUntil,
    doneAt: t.doneAt,
    role,
    ...(role === "seller" ? { feePercent: t.feePercent, payout: t.payout, payoutMethod: t.payoutMethod, buyerName: t.buyerName, disputeReason: t.disputeReason } : {}),
    ...(role === "buyer" ? { cred: tradeCred(t), disputeReason: t.disputeReason } : {}),
  };
}

/* ───────── 판매자 ───────── */

export async function createSafeTrade(
  shopId: string,
  seller: { id: string; name: string; discordId: string | null; plus: boolean },
  input: { title: string; description: string; price: number; cred: Cred; payoutMethod: "points" | "bank"; payoutAccount?: string | null },
) {
  const title = input.title.trim().slice(0, 60);
  if (title.length < 2) throw new Error("상품명을 2자 이상 적어 주세요.");
  const price = Math.round(input.price);
  if (!(price >= 1000 && price <= 5_000_000)) throw new Error("가격은 1,000원 ~ 5,000,000원 사이로 적어 주세요.");
  if (!input.cred.email.trim() || !input.cred.password) throw new Error("계정 로그인 정보(이메일 · 비밀번호)를 적어 주세요.");
  if (input.payoutMethod === "bank" && (input.payoutAccount ?? "").trim().length < 6) throw new Error("정산받을 계좌(은행 · 번호 · 예금주)를 적어 주세요.");
  const feePercent = seller.plus ? SAFE_FEE_PERCENT_PLUS : SAFE_FEE_PERCENT;
  return mutate(shopId, (db) => {
    if (db.trades.filter((t) => t.sellerId === seller.id && t.status === "open" && Date.parse(t.expiresAt) > Date.now()).length >= 10) {
      throw new Error("열려 있는 안전거래 링크는 10개까지예요. 안 쓰는 링크를 취소해 주세요.");
    }
    let id = newCode();
    while (db.trades.some((t) => t.id === id)) id = newCode();
    const now = Date.now();
    const t: SafeTrade = {
      id,
      sellerId: seller.id,
      sellerName: seller.name.slice(0, 40),
      sellerDiscordId: seller.discordId,
      title,
      description: input.description.trim().slice(0, 1000),
      price,
      feePercent,
      payout: Math.floor(price * (1 - feePercent / 100)),
      credEnc: encryptSecret(JSON.stringify({ email: input.cred.email.trim().slice(0, 120), password: input.cred.password.slice(0, 200), extra: (input.cred.extra ?? "").trim().slice(0, 500) })),
      payoutMethod: input.payoutMethod,
      payoutAccount: input.payoutMethod === "bank" ? (input.payoutAccount ?? "").trim().slice(0, 100) : null,
      status: "open",
      buyerId: null,
      buyerName: null,
      buyerDiscordId: null,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SAFE_OPEN_DAYS * 86_400_000).toISOString(),
      paidAt: null,
      holdUntil: null,
      doneAt: null,
      disputeReason: null,
    };
    db.trades.unshift(t);
    return t;
  });
}

export async function cancelSafeTrade(shopId: string, sellerId: string, id: string) {
  return mutate(shopId, (db) => {
    const t = db.trades.find((x) => x.id === id && x.sellerId === sellerId);
    if (!t) throw new Error("링크를 찾을 수 없어요.");
    if (t.status !== "open") throw new Error("결제 전 링크만 취소할 수 있어요.");
    t.status = "cancelled";
    return { ...t };
  });
}

export async function mySafeTrades(shopId: string, userId: string) {
  const db = await getSafeDb(shopId);
  return db.trades.filter((t) => t.sellerId === userId || t.buyerId === userId).slice(0, 30).map((t) => viewTrade(t, userId));
}

/* ───────── 구매자 ───────── */

export async function paySafeTrade(shopId: string, buyer: { id: string; name: string; discordId: string | null }, id: string) {
  const { changeUserPoints, persistAsync } = await import("@/lib/store");
  const t = await mutate(shopId, (db) => {
    const t = db.trades.find((x) => x.id === id);
    if (!t) throw new Error("없는 안전거래 링크예요.");
    if (t.sellerId === buyer.id) throw new Error("내가 만든 링크는 살 수 없어요.");
    if (t.status !== "open") throw new Error("이미 거래됐거나 닫힌 링크예요.");
    if (Date.parse(t.expiresAt) < Date.now()) {
      t.status = "expired";
      throw new Error("기간이 지난 링크예요. 판매자에게 새 링크를 받아 주세요.");
    }
    const r = changeUserPoints(shopId, buyer.id, -t.price, "safetrade.pay", { id: t.id, title: t.title, price: t.price });
    if (!r.ok) throw new Error(r.error === "포인트가 부족해요." ? `포인트가 부족해요. ${t.price.toLocaleString("ko-KR")}P 필요 — 먼저 충전해 주세요.` : r.error);
    const now = Date.now();
    t.status = "paid";
    t.buyerId = buyer.id;
    t.buyerName = buyer.name.slice(0, 40);
    t.buyerDiscordId = buyer.discordId;
    t.paidAt = new Date(now).toISOString();
    t.holdUntil = new Date(now + SAFE_HOLD_HOURS * 3_600_000).toISOString();
    return { ...t };
  });
  await persistAsync().catch(() => null);
  const cred = tradeCred(t);
  await dm(shopId, t.buyerDiscordId, [`**[DOES 안전거래] ${t.title} 결제 완료**`, "```", credText(cred), "```", `바로 접속해서 확인해 주세요. 문제가 있으면 <t:${Math.floor(Date.parse(t.holdUntil!) / 1000)}:R> 안에 링크에서 **문제 신고**를 눌러 주세요.`, safeUrl(t.id)]);
  await dm(shopId, t.sellerDiscordId, [`**[DOES 안전거래] ${t.title} 이(가) 결제됐어요**`, `구매자 ${t.buyerName} · ${won(t.price)}`, `구매자 보호 ${SAFE_HOLD_HOURS}시간 뒤(또는 구매자가 확정하면 바로) ${won(t.payout)} 정산돼요.`]);
  return { trade: t, cred };
}

export async function confirmSafeTrade(shopId: string, buyerId: string, id: string) {
  const t = await mutate(shopId, (db) => {
    const t = db.trades.find((x) => x.id === id && x.buyerId === buyerId);
    if (!t || t.status !== "paid") throw new Error("확정할 수 있는 거래가 아니에요.");
    t.holdUntil = new Date().toISOString();
    return { ...t };
  });
  await settle(shopId, t.id);
  return t;
}

export async function disputeSafeTrade(shopId: string, buyerId: string, id: string, reason: string) {
  const why = reason.trim().slice(0, 500);
  if (why.length < 5) throw new Error("어떤 문제인지 5자 이상 적어 주세요.");
  const t = await mutate(shopId, (db) => {
    const t = db.trades.find((x) => x.id === id && x.buyerId === buyerId);
    if (!t || t.status !== "paid") throw new Error("보호 기간 안의 거래만 신고할 수 있어요.");
    if (t.holdUntil && Date.parse(t.holdUntil) < Date.now()) throw new Error("구매자 보호 기간이 끝났어요. 문의로 연락해 주세요.");
    t.status = "held";
    t.disputeReason = why;
    return { ...t };
  });
  await postSafeAdminCard(shopId, t, "구매자가 문제를 신고했어요 — 정산을 멈췄어요");
  await dm(shopId, t.sellerDiscordId, [`**[DOES 안전거래] ${t.title} 거래에 문제 신고가 들어왔어요**`, `> ${why}`, "관리자가 확인할 때까지 정산이 멈춰요. 문의 채널로 연락해 주세요."]);
  return t;
}

/* ───────── 정산 ───────── */

async function settle(shopId: string, id: string) {
  const { changeUserPoints, persistAsync } = await import("@/lib/store");
  const t = await mutate(shopId, (db) => {
    const t = db.trades.find((x) => x.id === id);
    if (!t || t.status !== "paid") return null;
    if (t.payoutMethod === "points") {
      const r = changeUserPoints(shopId, t.sellerId, t.payout, "safetrade.payout", { id: t.id, title: t.title, price: t.price, fee: t.price - t.payout });
      if (!r.ok) return null;
      t.status = "done";
      t.doneAt = new Date().toISOString();
    } else {
      t.status = "settling";
    }
    return { ...t };
  });
  if (!t) return null;
  await persistAsync().catch(() => null);
  if (t.status === "done") {
    await dm(shopId, t.sellerDiscordId, [`**[DOES 안전거래] ${t.title} 정산 완료**`, `${won(t.payout)} 포인트가 들어왔어요. (수수료 ${t.feePercent}%)`]);
  } else {
    await postSafeAdminCard(shopId, t, "계좌 송금 대기 — 송금 후 [송금 완료]를 눌러 주세요");
  }
  return t;
}

/** 크론 — 만료 · 보호 끝난 거래 정산 */
export async function runSafeTradeSweep(shopId: string) {
  const now = Date.now();
  const db0 = await getSafeDb(shopId);
  const due = db0.trades.filter((t) => t.status === "paid" && t.holdUntil && Date.parse(t.holdUntil) <= now).map((t) => t.id);
  if (db0.trades.some((t) => t.status === "open" && Date.parse(t.expiresAt) < now)) {
    await mutate(shopId, (db) => {
      for (const t of db.trades) if (t.status === "open" && Date.parse(t.expiresAt) < now) t.status = "expired";
    });
  }
  for (const id of due) await settle(shopId, id).catch((e) => console.error("[safetrade] settle", e));
  return { settled: due.length };
}

/* ───────── 관리자 ───────── */

export async function adminSafeAction(shopId: string, id: string, action: "release" | "refund" | "paid") {
  const { changeUserPoints, persistAsync } = await import("@/lib/store");
  if (action === "release") {
    const t = await mutate(shopId, (db) => {
      const t = db.trades.find((x) => x.id === id);
      if (!t || t.status !== "held") throw new Error("신고로 보류된 거래만 풀 수 있어요.");
      t.status = "paid";
      t.holdUntil = new Date().toISOString();
      return { ...t };
    });
    return (await settle(shopId, t.id)) ?? t;
  }
  if (action === "refund") {
    const t = await mutate(shopId, (db) => {
      const t = db.trades.find((x) => x.id === id);
      if (!t || (t.status !== "held" && t.status !== "paid")) throw new Error("환불할 수 있는 거래가 아니에요.");
      if (!t.buyerId) throw new Error("구매자를 찾을 수 없어요.");
      const r = changeUserPoints(shopId, t.buyerId, t.price, "safetrade.refund", { id: t.id, title: t.title, price: t.price });
      if (!r.ok) throw new Error(r.error);
      t.status = "refunded";
      t.doneAt = new Date().toISOString();
      return { ...t };
    });
    await persistAsync().catch(() => null);
    await dm(shopId, t.buyerDiscordId, [`**[DOES 안전거래] ${t.title} 환불 완료**`, `${won(t.price)} 포인트를 돌려드렸어요.`]);
    await dm(shopId, t.sellerDiscordId, [`**[DOES 안전거래] ${t.title} 거래가 환불 처리됐어요**`, "구매자 신고가 확인돼 정산되지 않아요."]);
    return t;
  }
  const t = await mutate(shopId, (db) => {
    const t = db.trades.find((x) => x.id === id);
    if (!t || t.status !== "settling") throw new Error("송금 대기 중인 거래가 아니에요.");
    t.status = "done";
    t.doneAt = new Date().toISOString();
    return { ...t };
  });
  await dm(shopId, t.sellerDiscordId, [`**[DOES 안전거래] ${t.title} 정산 완료**`, `${won(t.payout)}을(를) 등록한 계좌로 보냈어요. (수수료 ${t.feePercent}%)`]);
  return t;
}

export async function setSafeAdminCard(shopId: string, id: string, card: SafeTrade["adminCard"]) {
  return mutate(shopId, (db) => {
    const t = db.trades.find((x) => x.id === id);
    if (t) t.adminCard = card;
  });
}

async function postSafeAdminCard(shopId: string, t: SafeTrade, note: string) {
  const { postSafeCard } = await import("@/lib/discord/safe-trade");
  await postSafeCard(shopId, t, note).catch((e) => console.error("[safetrade] card", e));
}

async function dm(shopId: string, discordId: string | null, lines: string[]) {
  if (!discordId) return;
  const { sendDiscordDm } = await import("@/lib/discord/dm");
  await sendDiscordDm(discordId, { content: lines.join("\n").slice(0, 1900) }, shopId).catch(() => null);
}
