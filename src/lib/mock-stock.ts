/**
 * 계정 차트 모의투자 — 현금 가치가 없는 모의 머니(DC)로 계정 차트 종목(전체 · 계정 종류 · 망토)을 사고판다.
 *
 * - 처음 들어오면 1,000,000 DC 지급 (포인트와 바꿀 수 없음 · 포인트로 살 수 없음)
 * - 가격 = 계정 차트의 오늘 평균가 (30분마다 갱신)
 * - 사고팔 때 수수료 0.1% · 소수점 단위(0.0001주)까지
 * - 총자산 = 남은 DC + 보유 수량 × 현재가 → 수익률 랭킹
 *
 * 실제 돈 · 포인트가 오가지 않는 순수 놀이용이다 (사행성 방지).
 */
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";

export const START_DC = 1_000_000;
export const TRADE_FEE = 0.001;

type Holder = { name: string; cash: number; hold: Record<string, number>; cost: Record<string, number>; trades: number; updatedAt: string };
type Db = { users: Record<string, Holder> };
const key = (shopId: string) => `mockstock:v1:${shopId}`;

async function getDb(shopId: string) {
  return (await kvGetJson<Db>(key(shopId))) ?? { users: {} };
}

/** 종목 = 계정 차트 그룹 (오늘 평균가 · 어제 대비) */
export async function stockAssets(shopId: string) {
  const [{ getMarketHistory, groupLabel }, { CAPE_BY_TYPE }] = await Promise.all([import("@/lib/market-index"), import("@/lib/capes-data")]);
  const hist = await getMarketHistory(shopId);
  const today = hist[hist.length - 1]?.groups ?? {};
  const prev = hist.length > 1 ? hist[hist.length - 2]!.groups : {};
  return Object.entries(today)
    .filter(([, g]) => g.avg > 0)
    .map(([id, g]) => {
      const p0 = prev[id]?.avg ?? 0;
      return { id, label: groupLabel(id, (t) => CAPE_BY_TYPE[t]?.title), price: g.avg, changePct: p0 ? Math.round(((g.avg - p0) / p0) * 1000) / 10 : null };
    })
    .sort((a, b) => b.price - a.price);
}

function valueOf(h: Holder, prices: Map<string, number>) {
  let v = h.cash;
  for (const [id, q] of Object.entries(h.hold)) v += q * (prices.get(id) ?? 0);
  return Math.round(v);
}

export async function myPortfolio(shopId: string, userId: string, name: string) {
  const [db, assets] = await Promise.all([getDb(shopId), stockAssets(shopId)]);
  const prices = new Map(assets.map((a) => [a.id, a.price]));
  const h = db.users[userId] ?? { name, cash: START_DC, hold: {}, cost: {}, trades: 0, updatedAt: new Date().toISOString() };
  const total = valueOf(h, prices);
  return {
    cash: Math.round(h.cash),
    total,
    profitPct: Math.round(((total - START_DC) / START_DC) * 1000) / 10,
    positions: Object.entries(h.hold)
      .filter(([, q]) => q > 0)
      .map(([id, q]) => {
        const a = assets.find((x) => x.id === id);
        const price = prices.get(id) ?? 0;
        const avgCost = h.cost[id] ? h.cost[id]! / q : 0;
        return { id, label: a?.label ?? id, qty: Math.round(q * 10_000) / 10_000, price, value: Math.round(q * price), avgCost: Math.round(avgCost), pnlPct: avgCost ? Math.round(((price - avgCost) / avgCost) * 1000) / 10 : 0 };
      }),
  };
}

export async function leaderboard(shopId: string, limit = 10) {
  const [db, assets] = await Promise.all([getDb(shopId), stockAssets(shopId)]);
  const prices = new Map(assets.map((a) => [a.id, a.price]));
  return Object.entries(db.users)
    .filter(([, h]) => h.trades > 0)
    .map(([id, h]) => ({ id, name: h.name, total: valueOf(h, prices) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
    .map((r, i) => ({ rank: i + 1, name: r.name, total: r.total, profitPct: Math.round(((r.total - START_DC) / START_DC) * 1000) / 10 }));
}

/** 사기 · 팔기 — amount 는 DC 금액(사기) 또는 수량(팔기) */
export async function trade(shopId: string, user: { id: string; name: string }, side: "buy" | "sell", assetId: string, amount: number) {
  const assets = await stockAssets(shopId);
  const a = assets.find((x) => x.id === assetId);
  if (!a) throw new Error("없는 종목이에요.");
  if (!(amount > 0)) throw new Error("수량을 확인해 주세요.");
  return withLock(key(shopId), async () => {
    const db = await getDb(shopId);
    const h = (db.users[user.id] ??= { name: user.name, cash: START_DC, hold: {}, cost: {}, trades: 0, updatedAt: new Date().toISOString() });
    h.name = user.name.slice(0, 24);
    if (side === "buy") {
      const spend = Math.floor(amount);
      if (spend < 100) throw new Error("100 DC 이상부터 살 수 있어요.");
      if (spend > h.cash) throw new Error(`DC가 부족해요. 보유 ${Math.floor(h.cash).toLocaleString("ko-KR")} DC`);
      const qty = Math.floor(((spend * (1 - TRADE_FEE)) / a.price) * 10_000) / 10_000;
      if (!(qty > 0)) throw new Error("금액이 너무 작아요.");
      h.cash -= spend;
      h.hold[a.id] = (h.hold[a.id] ?? 0) + qty;
      h.cost[a.id] = (h.cost[a.id] ?? 0) + spend;
    } else {
      const have = h.hold[a.id] ?? 0;
      const qty = Math.min(have, Math.floor(amount * 10_000) / 10_000);
      if (!(qty > 0)) throw new Error("팔 수량이 없어요.");
      const got = Math.floor(qty * a.price * (1 - TRADE_FEE));
      const ratio = have ? qty / have : 1;
      h.cost[a.id] = (h.cost[a.id] ?? 0) * (1 - ratio);
      h.hold[a.id] = have - qty;
      if (h.hold[a.id]! < 0.00005) {
        delete h.hold[a.id];
        delete h.cost[a.id];
      }
      h.cash += got;
    }
    h.trades += 1;
    h.updatedAt = new Date().toISOString();
    await kvPutJson(key(shopId), db);
    return { ok: true as const };
  });
}
