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

export type CoinKey = "btc" | "eth" | "usdt" | "usdc" | "sol" | "xrp" | "trx" | "doge" | "ltc" | "bch" | "ada";

/** 지금 송금 가능한 코인 — 이 목록에 없는 코인은 견적을 만들지 않는다 */
export const SENDABLE_COINS: CoinKey[] = ["ltc", "trx"];
export const isSendableCoin = (v: string): v is CoinKey => (SENDABLE_COINS as string[]).includes(v);

/** 코인 아이콘 (CC0 오픈 아이콘셋 cryptocurrency-icons) */
export function coinIconUrl(coin: CoinKey) {
  return `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/${coin}.svg`;
}

export const COINS: Record<
  CoinKey,
  {
    key: CoinKey;
    name: string;
    network: string;
    npCode: string;
    upbit: string;
    bithumb: string;
    decimals: number;
    explorer: (tx: string) => string;
    addressHint: string;
  }
> = {
  btc: {
    key: "btc",
    name: "비트코인 (BTC)",
    network: "Bitcoin",
    npCode: "btc",
    upbit: "KRW-BTC",
    bithumb: "BTC_KRW",
    decimals: 8,
    explorer: (tx) => `https://blockchair.com/bitcoin/transaction/${tx}`,
    addressHint: "bc1 · 1 · 3 으로 시작하는 비트코인 주소",
  },
  eth: {
    key: "eth",
    name: "이더리움 (ETH)",
    network: "Ethereum",
    npCode: "eth",
    upbit: "KRW-ETH",
    bithumb: "ETH_KRW",
    decimals: 18,
    explorer: (tx) => `https://etherscan.io/tx/${tx}`,
    addressHint: "0x 로 시작하는 이더리움 주소",
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
  usdc: {
    key: "usdc",
    name: "USDC (USD Coin)",
    network: "Polygon",
    npCode: "usdcpoly",
    upbit: "KRW-USDC",
    bithumb: "USDC_KRW",
    decimals: 6,
    explorer: (tx) => `https://polygonscan.com/tx/${tx}`,
    addressHint: "0x 로 시작하는 Polygon 주소",
  },
  sol: {
    key: "sol",
    name: "솔라나 (SOL)",
    network: "Solana",
    npCode: "sol",
    upbit: "KRW-SOL",
    bithumb: "SOL_KRW",
    decimals: 6,
    explorer: (tx) => `https://solscan.io/tx/${tx}`,
    addressHint: "32~44자리 솔라나 주소",
  },
  trx: {
    key: "trx",
    name: "트론 (TRX)",
    network: "TRON (TRC20)",
    npCode: "trx",
    upbit: "KRW-TRX",
    bithumb: "TRX_KRW",
    decimals: 6,
    explorer: (tx) => `https://tronscan.org/#/transaction/${tx}`,
    addressHint: "T 로 시작하는 트론 주소",
  },
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
  bch: {
    key: "bch",
    name: "비트코인캐시 (BCH)",
    network: "Bitcoin Cash",
    npCode: "bch",
    upbit: "KRW-BCH",
    bithumb: "BCH_KRW",
    decimals: 8,
    explorer: (tx) => `https://blockchair.com/bitcoin-cash/transaction/${tx}`,
    addressHint: "bitcoincash: 또는 q 로 시작하는 주소",
  },
  xrp: {
    key: "xrp",
    name: "리플 (XRP)",
    network: "XRP Ledger",
    npCode: "xrp",
    upbit: "KRW-XRP",
    bithumb: "XRP_KRW",
    decimals: 6,
    explorer: (tx) => `https://xrpscan.com/tx/${tx}`,
    addressHint: "r 로 시작하는 XRP 주소",
  },
  doge: {
    key: "doge",
    name: "도지코인 (DOGE)",
    network: "Dogecoin",
    npCode: "doge",
    upbit: "KRW-DOGE",
    bithumb: "DOGE_KRW",
    decimals: 8,
    explorer: (tx) => `https://blockchair.com/dogecoin/transaction/${tx}`,
    addressHint: "D 로 시작하는 도지코인 주소",
  },
  ada: {
    key: "ada",
    name: "카르다노 (ADA)",
    network: "Cardano",
    npCode: "ada",
    upbit: "KRW-ADA",
    bithumb: "ADA_KRW",
    decimals: 6,
    explorer: (tx) => `https://cardanoscan.io/transaction/${tx}`,
    addressHint: "addr1 로 시작하는 카르다노 주소",
  },
};

export const COIN_FEE_PERCENT = 3;
export const COIN_MIN_KRW = 5_000;
export const COIN_MAX_KRW = 990_000;
export const COIN_QUOTE_TTL_MS = 90_000;

/** VIP 등급별 누적 지출액(원) · 수수료 */
export const VIP_TIERS = [
  { tier: 0, name: "일반", minSpent: 0, feePercent: 3 },
  { tier: 1, name: "실버", minSpent: 500_000, feePercent: 2.5 },
  { tier: 2, name: "골드", minSpent: 2_000_000, feePercent: 2 },
  { tier: 3, name: "플래티넘", minSpent: 10_000_000, feePercent: 1.5 },
  { tier: 4, name: "다이아", minSpent: 50_000_000, feePercent: 1 },
  { tier: 5, name: "크라운", minSpent: 200_000_000, feePercent: 0.5 },
];

export function getVipTier(totalSpent: number): number {
  let tier = 0;
  for (const v of VIP_TIERS) {
    if (totalSpent >= v.minSpent) tier = v.tier;
  }
  return tier;
}

export function getVipFeePercent(tier: number): number {
  const v = VIP_TIERS.find((x) => x.tier === tier) || VIP_TIERS[0];
  return v.feePercent;
}

export function getVipName(tier: number): string {
  const v = VIP_TIERS.find((x) => x.tier === tier) || VIP_TIERS[0];
  return v.name;
}

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
  switch (coin) {
    case "btc":
      if (/^bc1[02-9ac-hj-np-z]{39,87}$/.test(a)) return null;
      if (/^[13][1-9A-HJ-NP-Za-km-z]{24,33}$/.test(a) && BASE58.test(a)) return null;
      return "비트코인 주소가 아니에요. bc1 · 1 · 3 으로 시작하는 주소를 넣어 주세요.";
    case "eth":
    case "usdc":
      if (/^0x[0-9a-fA-F]{40}$/.test(a)) return null;
      return "이더리움/Polygon 주소가 아니에요. 0x 로 시작하는 40자리 주소를 넣어 주세요.";
    case "ltc":
      if (/^ltc1[02-9ac-hj-np-z]{20,87}$/.test(a)) return null;
      if (/^[LM3][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(a)) return null;
      return "라이트코인 주소가 아니에요. L · M · ltc1 로 시작하는 주소를 넣어 주세요.";
    case "usdt":
    case "trx":
      if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a) && BASE58.test(a)) return null;
      return "트론(TRC20) 주소가 아니에요. T 로 시작하는 34자리 주소를 넣어 주세요.";
    case "sol":
      if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return null;
      return "솔라나 주소가 아니에요. 32~44자리 주소를 넣어 주세요.";
    case "bch":
      if (/^[qp][0-9a-z]{41}$/.test(a)) return null;
      if (/^bitcoincash:[qp][0-9a-z]{41}$/.test(a)) return null;
      if (/^[13][1-9A-HJ-NP-Za-km-z]{24,33}$/.test(a) && BASE58.test(a)) return null;
      return "비트코인캐시 주소가 아니에요. 올바른 형식을 확인해 주세요.";
    case "xrp":
      if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(a) && BASE58.test(a)) return null;
      return "리플 주소가 아니에요. r 로 시작하는 주소를 넣어 주세요.";
    case "doge":
      if (/^D[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(a) && BASE58.test(a)) return null;
      return "도지코인 주소가 아니에요. D 로 시작하는 주소를 넣어 주세요.";
    case "ada":
      if (/^addr1[0-9a-z]{98,}$/.test(a)) return null;
      return "카르다노 주소가 아니에요. addr1 로 시작하는 주소를 넣어 주세요.";
  }
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
  user: { id: string; discordId: string | null; totalCoinSpent?: number; vipTier?: number },
  coin: CoinKey,
  krw: number,
  address: string,
) {
  if (!isSendableCoin(coin)) throw new Error("지금은 LTC · TRX 만 송금할 수 있어요.");
  if (!Number.isInteger(krw) || krw < COIN_MIN_KRW || krw > COIN_MAX_KRW) {
    throw new Error(`금액은 ${COIN_MIN_KRW.toLocaleString("ko-KR")}원 ~ ${COIN_MAX_KRW.toLocaleString("ko-KR")}원 사이로 적어 주세요.`);
  }
  const addrErr = validateCoinAddress(coin, address);
  if (addrErr) throw new Error(addrErr);
  const { rate, source } = await fetchKrwRate(coin);
  const vipTier = user.vipTier ?? getVipTier(user.totalCoinSpent ?? 0);
  const feePercent = getVipFeePercent(vipTier);
  const coinAmount = coinAmountFor(coin, krw, rate, feePercent);
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
    feePercent,
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
  const o = await mutate(shopId, (list) => {
    const x = list.find((v) => v.id === id);
    if (!x) throw new Error("주문을 찾을 수 없어요.");
    if (x.status !== "pending") throw new Error("이미 처리된 주문이에요.");
    const now = new Date().toISOString();
    x.status = "sent";
    x.sendMode = "manual";
    x.reviewedAt = now;
    x.reviewedBy = adminId;
    x.sentAt = now;
    x.txid = txid.trim();
    return { ...x };
  });
  await recordCoinSpent(o);
  return o;
}

/** 송금 완료된 주문의 금액을 손님 VIP 누적액에 더한다 (한 주문당 한 번) */
async function recordCoinSpent(o: CoinOrder) {
  try {
    const { addCoinSpent } = await import("@/lib/store");
    addCoinSpent(o.shopId, o.userId, o.krw);
  } catch {
    /* 집계 실패는 송금 성공에 영향 주지 않는다 */
  }
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
  const res = await mutate(shopId, (list) => {
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
  if (res.changed && result.ok) await recordCoinSpent(res.order);
  return res;
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

/** 자동송금 방식: relay(고정IP 중계) > direct(Worker 직접) > manual(관리자 수동+TXID) */
export async function coinPayoutMode(): Promise<"relay" | "direct" | "manual"> {
  if (await coinRelayConfig()) return "relay";
  try {
    const { nowpaymentsPayoutConfig } = await import("@/lib/coin-payout-direct");
    if ((await nowpaymentsPayoutConfig()).configured) return "direct";
  } catch {
    /* 모듈 없음 */
  }
  return "manual";
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

/** 지갑 재고 — 보유 코인 잔액을 원화로 환산해 합산 (릴레이 또는 NOWPayments). 실패하면 null */
export async function coinWalletKrw(): Promise<number | null> {
  let bal: Record<string, number> | null = null;
  if (await coinRelayConfig()) {
    const rb = await relayBalance();
    if (rb) {
      bal = {};
      for (const [k, v] of Object.entries(rb)) if (v?.amount && v.amount > 0) bal[k.toLowerCase()] = v.amount;
    }
  } else {
    try {
      const { nowpaymentsBalance } = await import("@/lib/coin-payout-direct");
      bal = await nowpaymentsBalance();
    } catch {
      bal = null;
    }
  }
  if (!bal || !Object.keys(bal).length) return null;
  const byCur: Record<string, CoinKey> = {};
  for (const c of Object.values(COINS)) {
    byCur[c.npCode.toLowerCase()] = c.key;
    byCur[c.key] = c.key;
  }
  let totalKrw = 0;
  for (const [cur, amt] of Object.entries(bal)) {
    const key = byCur[cur] ?? (cur in COINS ? (cur as CoinKey) : null);
    if (!key) continue;
    try {
      const { rate } = await fetchKrwRate(key);
      totalKrw += amt * rate;
    } catch {
      /* 시세 실패한 코인은 건너뜀 */
    }
  }
  return totalKrw > 0 ? totalKrw : null;
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
