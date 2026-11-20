/**
 * DOES 시즌패스 — 8주 시즌 · 30단계 · 일반 보상(모두) / 패스 보상(패스 구매자)
 *
 * 경험치(XP)는 따로 쌓지 않고 시즌 기간의 실제 기록으로 계산한다 (놓치는 활동 없음):
 *   - 출석(무료 채굴) 하루 30 XP
 *   - 구매 500원당 1 XP
 *   - 후기 50 XP (시즌당 10개까지)
 *   - 패스 보유 시 전체 XP +25%
 * 100 XP = 1단계. 보상은 [보상 받기]로 한 번에 받는다 (포인트 · 렌탈 1일권).
 */
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";

export const PASS_PRICE = 9_900;
export const MAX_LEVEL = 30;
export const XP_PER_LEVEL = 100;
export const PASS_XP_BOOST = 0.25;
export const XP_RULES = { attendance: 30, per500won: 1, review: 50, reviewMax: 10 };
const SEASON_DAYS = 56;
/** 시즌 1 시작 — 2026-11-16 00:00 KST */
const ANCHOR = Date.parse("2026-11-15T15:00:00Z");
const COUNTED = new Set(["dispensed", "paid", "awaiting_fulfillment"]);

export type Reward = { t: "points"; n: number } | { t: "ticket"; n: number };
export type Tier = { level: number; free: Reward; pass: Reward };

export function currentSeason(now = Date.now()) {
  const no = Math.max(1, Math.floor((now - ANCHOR) / (SEASON_DAYS * 86_400_000)) + 1);
  const start = ANCHOR + (no - 1) * SEASON_DAYS * 86_400_000;
  const end = start + SEASON_DAYS * 86_400_000;
  return { no, id: `s${no}`, name: `시즌 ${no}`, start: new Date(start).toISOString(), end: new Date(end).toISOString(), daysLeft: Math.max(0, Math.ceil((end - now) / 86_400_000)) };
}

export function seasonTiers(): Tier[] {
  return Array.from({ length: MAX_LEVEL }, (_, k) => {
    const l = k + 1;
    const free: Reward = { t: "points", n: l === MAX_LEVEL ? 1000 : l % 5 === 0 ? 300 : 30 };
    const pass: Reward = l === MAX_LEVEL ? { t: "points", n: 3000 } : l % 10 === 0 ? { t: "ticket", n: 1 } : { t: "points", n: l % 5 === 0 ? 700 : 150 };
    return { level: l, free, pass };
  });
}

export function rewardLabel(r: Reward) {
  return r.t === "points" ? `${r.n.toLocaleString("ko-KR")}P` : `렌탈 ${r.n}일권`;
}

type UserState = { pass: boolean; passAt?: string; free: number[]; paid: number[] };
type Db = { users: Record<string, UserState> };
const key = (shopId: string, seasonId: string) => `seasonpass:v1:${shopId}:${seasonId}`;

async function getDb(shopId: string, seasonId: string) {
  return (await kvGetJson<Db>(key(shopId, seasonId))) ?? { users: {} };
}

/** 시즌 기간 실제 기록으로 XP 계산 */
export async function seasonXp(shopId: string, userId: string, season = currentSeason()) {
  const { getStoreForRead } = await import("@/lib/store");
  const s = getStoreForRead();
  const startDay = kstDay(season.start);
  const endDay = kstDay(season.end);
  const inRange = (iso: string | null | undefined) => !!iso && iso >= season.start && iso < season.end;
  const days = new Set((s.randomBoxClaims ?? []).filter((c) => c.shopId === shopId && c.userId === userId && !c.paid && c.dayKey >= startDay && c.dayKey < endDay).map((c) => c.dayKey));
  const spent = s.orders.filter((o) => o.shopId === shopId && o.userId === userId && COUNTED.has(o.status) && inRange(o.paidAt ?? o.createdAt)).reduce((a, o) => a + (o.amount || 0), 0);
  const reviews = Math.min(XP_RULES.reviewMax, (s.reviews ?? []).filter((r) => r.shopId === shopId && r.userId === userId && r.approved && inRange(r.createdAt)).length);
  const parts = { attendance: days.size * XP_RULES.attendance, purchase: Math.floor(spent / 500) * XP_RULES.per500won, review: reviews * XP_RULES.review };
  return { ...parts, base: parts.attendance + parts.purchase + parts.review, attendanceDays: days.size, spent, reviews };
}

function kstDay(iso: string) {
  return new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(0, 10);
}

export async function passState(shopId: string, userId: string) {
  const season = currentSeason();
  const [db, xp] = await Promise.all([getDb(shopId, season.id), seasonXp(shopId, userId, season)]);
  const u = db.users[userId] ?? { pass: false, free: [], paid: [] };
  const total = Math.floor(xp.base * (u.pass ? 1 + PASS_XP_BOOST : 1));
  const level = Math.min(MAX_LEVEL, Math.floor(total / XP_PER_LEVEL));
  const tiers = seasonTiers();
  const freeSet = new Set(u.free);
  const paidSet = new Set(u.paid);
  const claimable = tiers.filter((t) => t.level <= level && (!freeSet.has(t.level) || (u.pass && !paidSet.has(t.level)))).length;
  return {
    season,
    xp: { ...xp, total, boost: u.pass ? PASS_XP_BOOST : 0 },
    level,
    inLevel: level >= MAX_LEVEL ? XP_PER_LEVEL : total % XP_PER_LEVEL,
    pass: u.pass,
    claimedFree: u.free,
    claimedPass: u.paid,
    claimable,
    tiers: tiers.map((t) => ({
      level: t.level,
      free: { ...t.free, label: rewardLabel(t.free), state: freeSet.has(t.level) ? "claimed" : t.level <= level ? "ready" : "locked" },
      pass: { ...t.pass, label: rewardLabel(t.pass), state: paidSet.has(t.level) ? "claimed" : !u.pass ? "nopass" : t.level <= level ? "ready" : "locked" },
    })),
    price: PASS_PRICE,
  };
}

export async function buyPass(shopId: string, userId: string) {
  const season = currentSeason();
  const { changeUserPoints, persistAsync } = await import("@/lib/store");
  const out = await withLock(key(shopId, season.id), async () => {
    const db = await getDb(shopId, season.id);
    const u = (db.users[userId] ??= { pass: false, free: [], paid: [] });
    if (u.pass) throw new Error("이미 이번 시즌 패스를 갖고 있어요.");
    const r = changeUserPoints(shopId, userId, -PASS_PRICE, "seasonpass.buy", { season: season.id, price: PASS_PRICE });
    if (!r.ok) throw new Error(r.error === "포인트가 부족해요." ? `포인트가 부족해요. ${PASS_PRICE.toLocaleString("ko-KR")}P 필요` : r.error);
    u.pass = true;
    u.passAt = new Date().toISOString();
    await kvPutJson(key(shopId, season.id), db);
    return { balance: r.balance };
  });
  await persistAsync().catch(() => null);
  return out;
}

/** 받을 수 있는 보상 전부 받기 */
export async function claimAll(shopId: string, userId: string) {
  const st = await passState(shopId, userId);
  const season = st.season;
  const { changeUserPoints, persistAsync } = await import("@/lib/store");
  const got = await withLock(key(shopId, season.id), async () => {
    const db = await getDb(shopId, season.id);
    const u = (db.users[userId] ??= { pass: false, free: [], paid: [] });
    let points = 0;
    let tickets = 0;
    const freeL: number[] = [];
    const paidL: number[] = [];
    for (const t of seasonTiers()) {
      if (t.level > st.level) break;
      if (!u.free.includes(t.level)) {
        freeL.push(t.level);
        if (t.free.t === "points") points += t.free.n;
        else tickets += t.free.n;
      }
      if (u.pass && !u.paid.includes(t.level)) {
        paidL.push(t.level);
        if (t.pass.t === "points") points += t.pass.n;
        else tickets += t.pass.n;
      }
    }
    if (!freeL.length && !paidL.length) throw new Error("지금 받을 보상이 없어요. 레벨을 올려 보세요!");
    if (points > 0) {
      const r = changeUserPoints(shopId, userId, points, "seasonpass.reward", { season: season.id, free: freeL, pass: paidL });
      if (!r.ok) throw new Error(r.error);
    }
    if (tickets > 0) {
      const { grantTickets } = await import("@/lib/rental");
      await grantTickets(shopId, userId, tickets);
    }
    u.free.push(...freeL);
    u.paid.push(...paidL);
    await kvPutJson(key(shopId, season.id), db);
    return { points, tickets, count: freeL.length + paidL.length };
  });
  await persistAsync().catch(() => null);
  return got;
}
