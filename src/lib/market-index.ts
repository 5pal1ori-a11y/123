/**
 * 계정 차트 — 망토 · 계정 종류별 평균 시세를 하루 한 점씩 쌓고, 내일 추세를 추정한다.
 *
 * 그룹
 *  - all            : 판매 중인 마크 계정 전체
 *  - cat:<카테고리>  : 일반 계정 · OG 계정 · Minecon …
 *  - cape:<종류>     : 그 망토를 가진 계정 (+ 망토 단독 상품)
 * 값
 *  - avg / min / count : 오늘 판매 중인 상품의 실제 판매가(할인 반영) 기준
 *  - soldAvg / sold    : 최근 24시간 안에 팔린 주문 기준
 *
 * 오늘 점은 30분마다 다시 계산해 덮어쓰고, 날짜가 바뀌면 새 점이 생긴다. (KV · 최대 365일)
 */
import { kvGetJson, kvPutJson } from "@/lib/world/kv";
import { capeTypesFromHashes } from "@/lib/capes-data";

export type GroupStat = { avg: number; min: number; count: number; soldAvg: number | null; sold: number };
export type MarketPoint = { date: string; at: string; groups: Record<string, GroupStat> };
export type Forecast = { tomorrow: number | null; changePct: number | null; trend: "up" | "down" | "flat" | "unknown"; basis: number };

const key = (shopId: string) => `market:v1:${shopId}`;
const RECALC_MS = 30 * 60_000;
const KEEP_DAYS = 365;

export function kstDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export async function getMarketHistory(shopId: string) {
  return (await kvGetJson<MarketPoint[]>(key(shopId))) ?? [];
}

/** 그룹 이름 (화면용) */
export function groupLabel(id: string, capeTitle?: (type: string) => string | undefined) {
  if (id === "all") return "전체 계정";
  if (id.startsWith("cat:")) return id.slice(4);
  if (id.startsWith("cape:")) return `${capeTitle?.(id.slice(5)) ?? id.slice(5)} 망토`;
  return id;
}

function effectivePrice(p: { price: number; discountPercent?: number | null }) {
  const d = Math.min(90, Math.max(0, Number(p.discountPercent) || 0));
  return Math.round(p.price * (1 - d / 100));
}

/** 지금 판매 중인 상품 · 최근 24시간 판매로 오늘 점을 계산한다 */
export async function computeTodayPoint(shopId: string): Promise<MarketPoint> {
  const [{ listProducts, getStoreForRead }, { getChecklockDb }] = await Promise.all([import("@/lib/store"), import("@/lib/checklock")]);
  const products = listProducts(shopId).filter((p) => p.active && (p.productKind === "mc_account" || p.productKind === "mc_cape"));
  const lock = await getChecklockDb(shopId).catch(() => ({ entries: {} as Record<string, { capes: string[] }> }));

  /** 상품 하나가 속하는 그룹들 */
  const groupsOf = (p: (typeof products)[number]) => {
    const out = new Set<string>();
    if (p.productKind === "mc_cape") {
      if (p.capeType) out.add(`cape:${p.capeType}`);
      return out;
    }
    out.add("all");
    out.add(`cat:${p.category || "일반 계정"}`);
    const capes = Array.isArray(p.mcCapes) && p.mcCapes.length ? p.mcCapes : capeTypesFromHashes(lock.entries[p.id]?.capes ?? []);
    for (const c of capes) out.add(`cape:${c}`);
    return out;
  };

  const listing: Record<string, number[]> = {};
  for (const p of products) {
    if (p.stockStatus === "sold_out") continue;
    const price = effectivePrice(p);
    if (!(price > 0)) continue;
    for (const g of groupsOf(p)) (listing[g] ??= []).push(price);
  }

  const since = Date.now() - 24 * 3_600_000;
  const byId = new Map(getStoreForRead().products.filter((p) => p.shopId === shopId).map((p) => [p.id, p]));
  const sold: Record<string, number[]> = {};
  for (const o of getStoreForRead().orders) {
    if (o.shopId !== shopId || !o.paidAt || Date.parse(o.paidAt) < since) continue;
    if (!["paid", "dispensed", "awaiting_fulfillment"].includes(o.status)) continue;
    const p = byId.get(o.productId);
    if (!p || (p.productKind !== "mc_account" && p.productKind !== "mc_cape")) continue;
    const unit = Math.round(o.amount / Math.max(1, o.quantity || 1));
    for (const g of groupsOf(p as (typeof products)[number])) (sold[g] ??= []).push(unit);
  }

  const groups: Record<string, GroupStat> = {};
  for (const g of new Set([...Object.keys(listing), ...Object.keys(sold)])) {
    const l = listing[g] ?? [];
    const s = sold[g] ?? [];
    groups[g] = {
      avg: l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : 0,
      min: l.length ? Math.min(...l) : 0,
      count: l.length,
      soldAvg: s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null,
      sold: s.length,
    };
  }
  return { date: kstDate(), at: new Date().toISOString(), groups };
}

/** 크론에서 부른다 — 30분마다 오늘 점을 새로 계산해 저장 */
export async function updateMarketIndex(shopId: string, force = false) {
  const hist = await getMarketHistory(shopId);
  const last = hist[hist.length - 1];
  if (!force && last && last.date === kstDate() && Date.now() - Date.parse(last.at) < RECALC_MS) return last;
  const today = await computeTodayPoint(shopId);
  const next = last && last.date === today.date ? [...hist.slice(0, -1), today] : [...hist, today];
  await kvPutJson(key(shopId), next.slice(-KEEP_DAYS));
  return today;
}

/**
 * 내일 추세 — 최근 최대 14일 평균가로 직선 회귀(최소제곱)를 그어 다음 날 값을 추정한다.
 * 점이 3개 미만이면 추정하지 않는다. (투자 조언이 아닌 참고용 추정치)
 */
export function forecastGroup(hist: MarketPoint[], group: string): Forecast {
  const ys = hist
    .slice(-14)
    .map((p) => p.groups[group]?.avg ?? 0)
    .filter((v) => v > 0);
  if (ys.length < 3) return { tomorrow: null, changePct: null, trend: "unknown", basis: ys.length };
  const n = ys.length;
  const xs = ys.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  const slope = den ? num / den : 0;
  const tomorrow = Math.max(0, Math.round(my + slope * (n - mx)));
  const last = ys[n - 1]!;
  const changePct = last ? Math.round(((tomorrow - last) / last) * 1000) / 10 : null;
  const trend = changePct === null ? "unknown" : changePct > 1 ? "up" : changePct < -1 ? "down" : "flat";
  return { tomorrow, changePct, trend, basis: n };
}

/** 시세 조회 — 그룹의 오늘 평균 · 최저 (매입 · 보상판매 감정에 쓴다) */
export async function marketPriceFor(shopId: string, group: string) {
  const hist = await getMarketHistory(shopId);
  const g = hist[hist.length - 1]?.groups[group];
  return g ? { avg: g.avg, min: g.min, soldAvg: g.soldAvg } : null;
}
