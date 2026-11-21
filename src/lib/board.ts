/**
 * DOES 거래소 전광판 — 실시간 체결 · 오늘 거래액 · 시간대별 거래 · 시세 등락(계정 차트)
 * 공개 페이지(/board) · 디스코드 고정 이미지(/전광판)가 같은 데이터를 쓴다. 30초 캐시.
 */
const COUNTED = new Set(["dispensed", "paid", "awaiting_fulfillment"]);
const KST = 9 * 3_600_000;

export type BoardData = {
  at: string;
  today: { volume: number; trades: number; buyers: number; vsYesterdayPct: number | null };
  allTime: { trades: number };
  listings: number;
  hourly: number[];
  tape: { product: string; price: number; buyer: string; at: string }[];
  movers: { label: string; price: number; changePct: number }[];
};

let cache: { at: number; shopId: string; data: BoardData } | null = null;

function mask(name: string) {
  const n = name.trim() || "회원";
  return n.length <= 1 ? `${n}*` : `${n[0]}${"*".repeat(Math.min(3, n.length - 1))}`;
}
const kstDay = (ms: number) => new Date(ms + KST).toISOString().slice(0, 10);

export async function boardData(shopId: string): Promise<BoardData> {
  if (cache && cache.shopId === shopId && Date.now() - cache.at < 30_000) return cache.data;
  const [{ getStoreForRead, listProducts }, { getMarketHistory, groupLabel }, { CAPE_BY_TYPE }] = await Promise.all([
    import("@/lib/store"),
    import("@/lib/market-index"),
    import("@/lib/capes-data"),
  ]);
  const s = getStoreForRead();
  const now = Date.now();
  const today = kstDay(now);
  const yesterday = kstDay(now - 86_400_000);
  const products = new Map(listProducts(shopId).map((p) => [p.id, p]));
  const users = new Map(s.users.filter((u) => u.shopId === shopId).map((u) => [u.id, u]));
  const orders = s.orders
    .filter((o) => o.shopId === shopId && COUNTED.has(o.status))
    .map((o) => ({ o, t: Date.parse(o.paidAt ?? o.createdAt) }))
    .sort((a, b) => b.t - a.t);

  const hourly = Array.from({ length: 24 }, () => 0);
  let volume = 0;
  let trades = 0;
  let yVolumeSameTime = 0;
  const buyers = new Set<string>();
  const nowHour = new Date(now + KST).getUTCHours() + new Date(now + KST).getUTCMinutes() / 60;
  for (const { o, t } of orders) {
    const d = kstDay(t);
    if (d === today) {
      volume += o.amount;
      trades += 1;
      if (o.userId) buyers.add(o.userId);
      hourly[new Date(t + KST).getUTCHours()]! += o.amount;
    } else if (d === yesterday) {
      const h = new Date(t + KST).getUTCHours() + new Date(t + KST).getUTCMinutes() / 60;
      if (h <= nowHour) yVolumeSameTime += o.amount;
    } else if (d < yesterday) break;
  }

  const tape = orders.slice(0, 20).map(({ o, t }) => ({
    product: (products.get(o.productId)?.name ?? "계정").slice(0, 28),
    price: o.amount,
    buyer: mask(users.get(o.userId ?? "")?.name ?? ""),
    at: new Date(t).toISOString(),
  }));

  const hist = await getMarketHistory(shopId);
  const last = hist[hist.length - 1]?.groups ?? {};
  const prev = hist.length > 1 ? hist[hist.length - 2]!.groups : {};
  const movers = Object.entries(last)
    .filter(([id, g]) => g.avg > 0 && prev[id]?.avg)
    .map(([id, g]) => ({ label: groupLabel(id, (t) => CAPE_BY_TYPE[t]?.title), price: Math.round(g.avg), changePct: Math.round(((g.avg - prev[id]!.avg) / prev[id]!.avg) * 1000) / 10 }))
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 8);

  const data: BoardData = {
    at: new Date(now).toISOString(),
    today: { volume, trades, buyers: buyers.size, vsYesterdayPct: yVolumeSameTime > 0 ? Math.round(((volume - yVolumeSameTime) / yVolumeSameTime) * 1000) / 10 : null },
    allTime: { trades: orders.length },
    listings: [...products.values()].filter((p) => p.availableCount > 0).length,
    hourly,
    tape,
    movers,
  };
  cache = { at: now, shopId, data };
  return data;
}
