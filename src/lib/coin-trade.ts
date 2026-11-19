/**
 * 코인대행 — 손님이 포인트(원화)로 LTC · USDT(TRC20) 를 사면, 관리자 승인 뒤 손님 지갑으로 보내 준다.
 *
 * 흐름: 견적(실시간 업비트 원화 시세 + 수수료 3%) → 손님 확정(포인트 차감) → 관리자 승인
 *      → NOWPayments 송금 중계 서버(고정 IP · 2FA)로 자동 송금, 또는 관리자가 직접 보내고 TXID 입력
 *      → 완료 · 실패 시 손님 DM (실패 · 거절은 포인트 자동 환불)
 *
 * 주문 목록은 KV(coin:v1:<shopId>)에 둔다 — 상점 DB(vendix:db)를 키우지 않게.
 */
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { changeUserPoints } from "@/lib/store";
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";

export type CoinKey = "ltc" | "usdt";

export const COINS: Record<
  CoinKey,
  {
    key: CoinKey;
    name: string;
    network: string;
    /** NOWPayments 통화 코드 */
    npCode: string;
    /** 업비트 · 빗썸 원화 마켓 */
    upbit: string;
    bithumb: string;
    decimals: number;
    explorer: (tx: string) => string;
    addressHint: string;
  }
> = {
  ltc: {
    key: "ltc",
    name: "라이트코인 (LTC)",
    network: "Litecoin",
    npCode: "ltc",
    upbit: "KRW-LTC",
    bithumb: "LTC_KRW",
    decimals: 6,
    explorer: (tx) => `https://blockchair.com/litecoin/transaction/${tx}`,
    addressHint: "L · M · ltc1 로 시작하는 주소",
  },
  usdt: {
    key: "usdt",
    name: "테더 (USDT)",
    network: "TRC20 (트론)",
    npCode: "usdttrc20",
    upbit: "KRW-USDT",
    bithumb: "USDT_KRW",
    decimals: 2,
    explorer: (tx) => `https://tronscan.org/#/transaction/${tx}`,
    addressHint: "T 로 시작하는 트론(TRC20) 주소",
  },
};

export const COIN_FEE_PERCENT = 3;
export const COIN_MIN_KRW = 5_000;
/** 100만 원 이상은 트래블룰(수취인 정보 확인) 대상이라 한 번에 99만 원까지만 받는다 */
export const COIN_MAX_KRW = 990_000;
/** 견적 유효 시간 */
export const COIN_QUOTE_TTL_MS = 90_000;

export type CoinOrderStatus = "quote" | "pending" | "sending" | "sent" | "failed" | "rejected" | "cancelled" | "expired";

export type CoinOrder = {
  id: string;
  shopId: string;
  userId: string;
  discordId: string | null;
  coin: CoinKey;
  address: string;
  krw: number;
  feePercent: number;
  /** 코인 1개 원화 시세 (견적 당시) */
  rate: number;
  rateSource: string;
  coinAmount: number;
  status: CoinOrderStatus;
  createdAt: string;
  quoteExpiresAt: string;
  paidAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  sentAt: string | null;
  txid: string | null;
  payoutId: string | null;
  sendMode: "auto" | "manual" | null;
  failReason: string | null;
  refunded: boolean;
  adminCard: { channelId: string; messageId: string } | null;
};

const key = (shopId: string) => `coin:v1:${shopId}`;
const MAX_KEEP = 1000;

export async function listCoinOrders(shopId: string) {
  return (await kvGetJson<CoinOrder[]>(key(shopId))) ?? [];
}

export async function getCoinOrder(shopId: string, id: string) {
  return (await listCoinOrders(shopId)).find((o) => o.id === id) ?? null;
}

async function mutate<T>(shopId: string, fn: (list: CoinOrder[]) => T) {
  return withLock(key(shopId), async () => {
    const list = await listCoinOrders(shopId);
    const out = fn(list);
    await kvPutJson(key(shopId), list.slice(0, MAX_KEEP));
    return out;
  });
}

export async function updateCoinOrder(shopId: string, id: string, fn: (o: CoinOrder) => void) {
  return mutate(shopId, (list) => {
    const o = list.find((x) => x.id === id);
    if (!o) throw new Error("주문을 찾을 수 없어요.");
    fn(o);
    return { ...o };
  });
}

/* ───────────── 주소 · 금액 ───────────── */

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

export function validateCoinAddress(coin: CoinKey, raw: string): string | null {
  const a = raw.trim();
  if (coin === "ltc") {
    if (/^ltc1[02-9ac-hj-np-z]{20,87}$/.test(a)) return null;
    if (/^[LM3][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(a)) return null;
    return "라이트코인 주소가 아니에요. L · M · ltc1 로 시작하는 주소를 넣어 주세요.";
  }
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a) && BASE58.test(a)) return null;
  return "트론(TRC20) 주소가 아니에요. T 로 시작하는 34자리 주소를 넣어 주세요. (이더리움 0x 주소는 안 돼요)";
}

export function floorTo(n: number, decimals: number) {
  const f = 10 ** decimals;
  return Math.floor(n * f) / f;
}

export function coinAmountFor(coin: CoinKey, krw: number, rate: number, feePercent = COIN_FEE_PERCENT) {
  return floorTo(krw / (rate * (1 + feePercent / 100)), COINS[coin].decimals);
}

export function formatCoin(coin: CoinKey, n: number) {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: COINS[coin].decimals })} ${coin.toUpperCase()}`;
}

/* ───────────── 시세 (업비트 → 빗썸) ───────────── */

export async function fetchKrwRate(coin: CoinKey): Promise<{ rate: number; source: string }> {
  const c = COINS[coin];
  try {
    const r = await fetch(`https://api.upbit.com/v1/ticker?markets=${c.upbit}`, { headers: { accept: "application/json" } });
    if (r.ok) {
      const j = (await r.json()) as { trade_price?: number }[];
      const p = Number(j?.[0]?.trade_price);
      if (Number.isFinite(p) && p > 0) return { rate: p, source: "업비트" };
    }
  } catch {
    /* 아래 빗썸 */
  }
  try {
    const r = await fetch(`https://api.bithumb.com/public/ticker/${c.bithumb}`);
    if (r.ok) {
      const j = (await r.json()) as { data?: { closing_price?: string } };
      const p = Number(j?.data?.closing_price);
      if (Number.isFinite(p) && p > 0) return { rate: p, source: "빗썸" };
    }
  } catch {
    /* 실패 */
  }
  throw new Error("지금 시세를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.");
}

/* ───────────── 주문 ───────────── */

export async function createCoinQuote(
  shopId: string,
  user: { id: string; discordId: string | null },
  coin: CoinKey,
  krw: number,
  address: string,
) {
  if (!Number.isInteger(krw) || krw < COIN_MIN_KRW || krw > COIN_MAX_KRW) {
    throw new Error(`금액은 ${COIN_MIN_KRW.toLocaleString("ko-KR")}원 ~ ${COIN_MAX_KRW.toLocaleString("ko-KR")}원 사이로 적어 주세요.`);
  }
  const addrErr = validateCoinAddress(coin, address);
  if (addrErr) throw new Error(addrErr);
  const { rate, source } = await fetchKrwRate(coin);
  const coinAmount = coinAmountFor(coin, krw, rate);
  if (!(coinAmount > 0)) throw new Error("금액이 너무 작아요.");
  const now = Date.now();
  const order: CoinOrder = {
    id: `cn_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
    shopId,
    userId: user.id,
    discordId: user.discordId,
    coin,
    address: address.trim(),
    krw,
    feePercent: COIN_FEE_PERCENT,
    rate,
    rateSource: source,
    coinAmount,
    status: "quote",
    createdAt: new Date(now).toISOString(),
    quoteExpiresAt: new Date(now + COIN_QUOTE_TTL_MS).toISOString(),
    paidAt: null,
    reviewedAt: null,
    reviewedBy: null,
    sentAt: null,
    txid: null,
    payoutId: null,
    sendMode: null,
    failReason: null,
    refunded: false,
    adminCard: null,
  };
  await mutate(shopId, (list) => {
    // 오래된 견적은 정리
    const cutoff = now - 24 * 3_600_000;
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i]!;
      if (o.status === "quote" && Date.parse(o.createdAt) < cutoff) list.splice(i, 1);
    }
    list.unshift(order);
  });
  return order;
}

/** 손님이 [확정] — 견적 시간 안이면 포인트를 빼고 관리자 승인 대기로 */
export async function confirmCoinOrder(shopId: string, id: string, userId: string) {
  return mutate(shopId, (list) => {
    const o = list.find((x) => x.id === id);
    if (!o || o.userId !== userId) throw new Error("주문을 찾을 수 없어요.");
    if (o.status !== "quote") throw new Error("이미 처리된 주문이에요.");
    if (Date.now() > Date.parse(o.quoteExpiresAt)) {
      o.status = "expired";
      throw new Error("견적 시간이 지났어요. 시세가 바뀌었을 수 있어서 다시 신청해 주세요.");
    }
    const paid = changeUserPoints(shopId, userId, -o.krw, "coin.order", { orderId: o.id, coin: o.coin, krw: o.krw, coinAmount: o.coinAmount });
    if (!paid.ok) {
      throw new Error(
        paid.balance !== undefined
          ? `포인트가 부족해요. 필요 ${o.krw.toLocaleString("ko-KR")}P · 보유 ${paid.balance.toLocaleString("ko-KR")}P`
          : paid.error,
      );
    }
    o.status = "pending";
    o.paidAt = new Date().toISOString();
    return { ...o, balance: paid.balance };
  });
}

export async function cancelCoinQuote(shopId: string, id: string, userId: string) {
  return mutate(shopId, (list) => {
    const o = list.find((x) => x.id === id);
    if (!o || o.userId !== userId) throw new Error("주문을 찾을 수 없어요.");
    if (o.status !== "quote") throw new Error("이미 처리된 주문이에요.");
    o.status = "cancelled";
    return { ...o };
  });
}

/** 포인트 돌려주기 (거절 · 송금 실패) — 한 번만 */
function refundPoints(o: CoinOrder, why: string) {
  if (o.refunded || !o.paidAt) return;
  const r = changeUserPoints(o.shopId, o.userId, o.krw, "coin.refund", { orderId: o.id, krw: o.krw, why });
  if (r.ok) o.refunded = true;
}

export async function rejectCoinOrder(shopId: string, id: string, adminId: string, reason: string) {
  return mutate(shopId, (list) => {
    const o = list.find((x) => x.id === id);
    if (!o) throw new Error("주문을 찾을 수 없어요.");
    if (o.status !== "pending") throw new Error("이미 처리된 주문이에요.");
    o.status = "rejected";
    o.reviewedAt = new Date().toISOString();
    o.reviewedBy = adminId;
    o.failReason = reason || null;
    refundPoints(o, "rejected");
    return { ...o };
  });
}

/** 관리자가 직접 보내고 TXID 입력 */
export async function markCoinOrderSentManually(shopId: string, id: string, adminId: string, txid: string) {
  return mutate(shopId, (list) => {
    const o = list.find((x) => x.id === id);
    if (!o) throw new Error("주문을 찾을 수 없어요.");
    if (o.status !== "pending") throw new Error("이미 처리된 주문이에요.");
    const now = new Date().toISOString();
    o.status = "sent";
    o.sendMode = "manual";
    o.reviewedAt = now;
    o.reviewedBy = adminId;
    o.sentAt = now;
    o.txid = txid.trim();
    return { ...o };
  });
}

/** 자동 송금 시작 (pending → sending) — 두 번 눌러도 한 번만 */
export async function beginCoinAutoSend(shopId: string, id: string, adminId: string) {
  return mutate(shopId, (list) => {
    const o = list.find((x) => x.id === id);
    if (!o) throw new Error("주문을 찾을 수 없어요.");
    if (o.status !== "pending") throw new Error("이미 처리된 주문이에요.");
    o.status = "sending";
    o.sendMode = "auto";
    o.reviewedAt = new Date().toISOString();
    o.reviewedBy = adminId;
    return { ...o };
  });
}

/** 중계 서버 결과 반영 */
export async function finishCoinAutoSend(
  shopId: string,
  id: string,
  result: { ok: true; txid: string | null; payoutId: string | null } | { ok: false; error: string; payoutId?: string | null },
) {
  return mutate(shopId, (list) => {
    const o = list.find((x) => x.id === id);
    if (!o) throw new Error("주문을 찾을 수 없어요.");
    if (o.status !== "sending") return { order: { ...o }, changed: false };
    if (result.payoutId) o.payoutId = result.payoutId;
    if (result.ok) {
      o.status = "sent";
      o.sentAt = new Date().toISOString();
      o.txid = result.txid;
    } else {
      o.status = "failed";
      o.failReason = result.error.slice(0, 300);
      refundPoints(o, "payout_failed");
    }
    return { order: { ...o }, changed: true };
  });
}

export async function setCoinAdminCard(shopId: string, id: string, card: { channelId: string; messageId: string }) {
  return updateCoinOrder(shopId, id, (o) => {
    o.adminCard = card;
  });
}

/* ───────────── 송금 중계 서버 ───────────── */

export async function coinRelayConfig() {
  let url = "";
  let secret = "";
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const e = env as { COIN_RELAY_URL?: string; COIN_RELAY_SECRET?: string };
    url = e.COIN_RELAY_URL?.trim() || "";
    secret = e.COIN_RELAY_SECRET?.trim() || "";
  } catch {
    /* local */
  }
  url ||= process.env.COIN_RELAY_URL?.trim() || "";
  secret ||= process.env.COIN_RELAY_SECRET?.trim() || "";
  return url && secret ? { url: url.replace(/\/+$/, ""), secret } : null;
}

export function relaySign(secret: string, ts: string, body: string) {
  return createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
}

export function relayVerify(secret: string, ts: string | null, body: string, sig: string | null) {
  if (!ts || !sig) return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(Date.now() - t) > 5 * 60_000) return false;
  const a = Buffer.from(relaySign(secret, ts, body));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 중계 서버에 송금 요청 — 서버가 NOWPayments 송금 생성 · 2FA 확인까지 하고, 끝나면 callbackUrl 로 알려 준다 */
export async function requestRelayPayout(o: CoinOrder, callbackUrl: string) {
  const cfg = await coinRelayConfig();
  if (!cfg) throw new Error("송금 중계 서버가 설정돼 있지 않아요.");
  const body = JSON.stringify({
    orderId: o.id,
    shopId: o.shopId,
    currency: COINS[o.coin].npCode,
    amount: o.coinAmount,
    address: o.address,
    callbackUrl,
  });
  const ts = String(Date.now());
  const r = await fetch(`${cfg.url}/payout`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-relay-ts": ts, "x-relay-sig": relaySign(cfg.secret, ts, body) },
    body,
  });
  const j = (await r.json().catch(() => null)) as { ok?: boolean; payoutId?: string; error?: string } | null;
  if (!r.ok || !j?.ok) throw new Error(j?.error || `중계 서버 오류 (${r.status})`);
  return { payoutId: j.payoutId ?? null };
}

export async function relayBalance() {
  const cfg = await coinRelayConfig();
  if (!cfg) return null;
  const ts = String(Date.now());
  const r = await fetch(`${cfg.url}/balance`, { headers: { "x-relay-ts": ts, "x-relay-sig": relaySign(cfg.secret, ts, "") } }).catch(() => null);
  if (!r?.ok) return null;
  return (await r.json().catch(() => null)) as Record<string, { amount?: number; pendingAmount?: number }> | null;
}

/* ───────────── 통계 ───────────── */

export async function coinStats(shopId: string) {
  const list = await listCoinOrders(shopId);
  const sent = list.filter((o) => o.status === "sent");
  return {
    orders: sent.length,
    buyers: new Set(sent.map((o) => o.userId)).size,
    volume: sent.reduce((n, o) => n + o.krw, 0),
    pending: list.filter((o) => o.status === "pending" || o.status === "sending").length,
  };
}
