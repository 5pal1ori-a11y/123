import { getReviewFeed } from "@/lib/review-feed";
import {
  creditUserPoints,
  getProductById,
  getShopSettings,
  getStoreForRead,
  getTodayRandomBoxClaim,
  kstDayKey,
  listProducts,
} from "@/lib/store";
import type { ShopUser, WorldMissionType, WorldSettings } from "@/lib/types";
import { isClientAdv, type AdvId } from "./advancements";
import { mazeShortestSteps, treasureSpotsForDay, TREASURE_PER_DAY } from "./games";
import { kvGetJson, kvPutJson, withLock } from "./kv";
import { MINE_TOKENS, MineGen, mineOfDay } from "@/lib/voxel/mine";

export const DEFAULT_WORLD_SETTINGS: WorldSettings = {
  parkourCoupon: { enabled: true, amount: 1000, minutes: 10 },
  missions: {
    attend: { enabled: true, tokens: 1 },
    parkour: { enabled: true, tokens: 3 },
    build: { enabled: true, tokens: 1 },
    review: { enabled: true, tokens: 2 },
    purchase: { enabled: true, tokens: 3 },
    end_visit: { enabled: true, tokens: 1 },
  },
  recipes: [],
  accounts: [],
};

export const MISSION_INFO: Record<WorldMissionType, { title: string; desc: string }> = {
  attend: { title: "다이아몬드 캐기", desc: "출석체크에서 다이아몬드 원석을 1개 캐세요" },
  parkour: { title: "하늘섬 파쿠르 완주", desc: "내 섬 뒤편 점프맵 끝 신호기까지 올라가세요" },
  build: { title: "섬 꾸미기", desc: "내 섬에 블록을 1개 이상 놓거나 옮기세요" },
  review: { title: "후기 남기기", desc: "사이트나 디스코드 후기 채널에 후기를 1개 남기세요" },
  purchase: { title: "상품 구매하기", desc: "상점에서 아무 상품이나 1개 구매하세요" },
  end_visit: { title: "계정시장 구경", desc: "광장 서쪽 계정시장 정자로 가서 판매 계정을 구경하세요" },
};

const MISSION_ORDER: WorldMissionType[] = ["attend", "parkour", "build", "review", "end_visit", "purchase"];

export function getWorldSettings(shopId: string): WorldSettings {
  const raw = getShopSettings(shopId).world;
  return {
    parkourCoupon: { ...DEFAULT_WORLD_SETTINGS.parkourCoupon, ...(raw?.parkourCoupon ?? {}) },
    missions: Object.fromEntries(
      MISSION_ORDER.map((t) => [t, { ...DEFAULT_WORLD_SETTINGS.missions[t], ...(raw?.missions?.[t] ?? {}) }]),
    ) as WorldSettings["missions"],
    recipes: Array.isArray(raw?.recipes) ? raw.recipes : [],
    accounts: Array.isArray(raw?.accounts) ? raw.accounts : [],
  };
}

function hashDay(dayKey: string) {
  let h = 0;
  for (let i = 0; i < dayKey.length; i++) h = (h * 131 + dayKey.charCodeAt(i)) >>> 0;
  return h;
}

/** 날짜마다 모두에게 같은 미션 하나 */
export function missionForDay(settings: WorldSettings, dayKey = kstDayKey()): WorldMissionType | null {
  const pool = MISSION_ORDER.filter((t) => settings.missions[t].enabled);
  if (!pool.length) return null;
  return pool[hashDay(dayKey) % pool.length]!;
}

/* ───────────── 사용자 기록 ───────────── */

type WorldRecord = {
  v: 1;
  tokens: number;
  claims: string[];
  parkourStart: number | null;
  parkourDays: string[];
  buildDays: string[];
  endVisitDays: string[];
  coupon: { code: string; amount: number; expiresAt: string; usedAt: string | null } | null;
  log: { at: string; delta: number; reason: string }[];
  adv: Record<string, string>;
  mazeStart: { at: number; day: string } | null;
  mazeDays: string[];
  mazeBest: Record<string, number>;
  treasure: { day: string; found: number[]; last: number; claimed: boolean } | null;
  mineStart: { at: number; day: string } | null;
  mineBest: Record<string, number>;
};

type CouponRecord = { shopId: string; userId: string; amount: number; expiresAt: string; usedAt: string | null };

const recordKey = (shopId: string, userId: string) => `world:${shopId}:${userId}`;
const couponKey = (code: string) => `wcoupon:${code}`;

function fresh(): WorldRecord {
  return {
    v: 1,
    tokens: 0,
    claims: [],
    parkourStart: null,
    parkourDays: [],
    buildDays: [],
    endVisitDays: [],
    coupon: null,
    log: [],
    adv: {},
    mazeStart: null,
    mazeDays: [],
    mazeBest: {},
    treasure: null,
    mineStart: null,
    mineBest: {},
  };
}

/** 처음 달성한 것만 돌려준다 */
function grant(r: WorldRecord, ids: AdvId[]): AdvId[] {
  const now = new Date().toISOString();
  return ids.filter((id) => {
    if (r.adv[id]) return false;
    r.adv[id] = now;
    return true;
  });
}

async function load(shopId: string, userId: string): Promise<WorldRecord> {
  const r = await kvGetJson<WorldRecord>(recordKey(shopId, userId));
  if (!r || r.v !== 1) return fresh();
  return { ...fresh(), ...r };
}

const keepDays = (days: string[], day: string) => [...new Set([...days, day])].sort().slice(-40);

async function save(shopId: string, userId: string, r: WorldRecord) {
  r.log = r.log.slice(-60);
  await kvPutJson(recordKey(shopId, userId), r);
}

function lockKey(shopId: string, userId: string) {
  return `world:${shopId}:${userId}`;
}

/* ───────────── 미션 ───────────── */

const sameDay = (iso: string, day: string) => kstDayKey(new Date(iso)) === day;

async function missionDone(type: WorldMissionType, shopId: string, user: ShopUser, r: WorldRecord, day: string) {
  switch (type) {
    case "attend":
      return Boolean(getTodayRandomBoxClaim(shopId, user.id));
    case "parkour":
      return r.parkourDays.includes(day);
    case "build":
      return r.buildDays.includes(day);
    case "end_visit":
      return r.endVisitDays.includes(day);
    case "purchase":
      return getStoreForRead().orders.some(
        (o) => o.shopId === shopId && o.userId === user.id && o.status === "dispensed" && sameDay(o.createdAt, day),
      );
    case "review": {
      const site = getStoreForRead().reviews.some((v) => v.shopId === shopId && v.userId === user.id && sameDay(v.createdAt, day));
      if (site) return true;
      if (!user.discordId) return false;
      const feed = await getReviewFeed(shopId).catch(() => null);
      return Boolean(feed?.items.some((i) => i.source === "discord" && i.authorId === user.discordId && sameDay(i.createdAt, day)));
    }
  }
}

export type MissionStatus = {
  type: WorldMissionType;
  title: string;
  desc: string;
  tokens: number;
  done: boolean;
  claimed: boolean;
  dayKey: string;
} | null;

async function statusFrom(shopId: string, user: ShopUser, r: WorldRecord): Promise<MissionStatus> {
  const settings = getWorldSettings(shopId);
  const day = kstDayKey();
  const type = missionForDay(settings, day);
  if (!type) return null;
  return {
    type,
    ...MISSION_INFO[type],
    tokens: settings.missions[type].tokens,
    done: await missionDone(type, shopId, user, r, day),
    claimed: r.claims.includes(day),
    dayKey: day,
  };
}

export async function claimMission(shopId: string, user: ShopUser) {
  return withLock(lockKey(shopId, user.id), async () => {
    const r = await load(shopId, user.id);
    const status = await statusFrom(shopId, user, r);
    if (!status) return { ok: false as const, error: "오늘은 미션이 없어요" };
    if (status.claimed) return { ok: false as const, error: "오늘 보상은 이미 받았어요" };
    if (!status.done) return { ok: false as const, error: "아직 미션을 끝내지 않았어요" };
    r.claims = keepDays(r.claims, status.dayKey);
    r.tokens += status.tokens;
    r.log.push({ at: new Date().toISOString(), delta: status.tokens, reason: `미션 · ${status.title}` });
    const adv = grant(r, ["mission"]);
    await save(shopId, user.id, r);
    return { ok: true as const, tokens: r.tokens, gained: status.tokens, mission: { ...status, claimed: true }, adv };
  });
}

/* ───────────── 활동 기록 ───────────── */

export async function markBuild(shopId: string, userId: string) {
  await withLock(lockKey(shopId, userId), async () => {
    const r = await load(shopId, userId);
    const day = kstDayKey();
    if (r.buildDays.includes(day)) return;
    r.buildDays = keepDays(r.buildDays, day);
    await save(shopId, userId, r);
  });
}

export async function markEndVisit(shopId: string, userId: string) {
  await withLock(lockKey(shopId, userId), async () => {
    const r = await load(shopId, userId);
    const day = kstDayKey();
    if (r.endVisitDays.includes(day)) return;
    r.endVisitDays = keepDays(r.endVisitDays, day);
    await save(shopId, userId, r);
  });
}

/* ───────────── 파쿠르 · 쿠폰 ───────────── */

/** 하늘 파쿠르 51칸을 아무리 빨라도 이보다 빨리 깰 수는 없다 */
const PARKOUR_MIN_MS = 30_000;
const PARKOUR_MAX_MS = 45 * 60_000;

export async function parkourStart(shopId: string, userId: string) {
  return withLock(lockKey(shopId, userId), async () => {
    const r = await load(shopId, userId);
    r.parkourStart = Date.now();
    await save(shopId, userId, r);
    return { ok: true as const };
  });
}

function couponCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
  return `DS-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
}

export type PublicCoupon = { code: string; amount: number; expiresAt: string; usedAt: string | null };

export async function parkourFinish(shopId: string, userId: string) {
  return withLock(lockKey(shopId, userId), async () => {
    const r = await load(shopId, userId);
    const now = Date.now();
    const started = r.parkourStart;
    if (!started || now - started > PARKOUR_MAX_MS) return { ok: false as const, error: "점프맵 첫 블록부터 다시 시작해 주세요" };
    if (now - started < PARKOUR_MIN_MS) return { ok: false as const, error: "기록이 너무 빨라요. 처음부터 다시 도전해 주세요" };
    r.parkourStart = null;
    r.parkourDays = keepDays(r.parkourDays, kstDayKey());

    const settings = getWorldSettings(shopId).parkourCoupon;
    let coupon: PublicCoupon | null = null;
    let fresh = false;
    if (settings.enabled && settings.amount > 0 && !r.coupon) {
      const code = couponCode();
      const expiresAt = new Date(now + Math.max(1, settings.minutes) * 60_000).toISOString();
      r.coupon = { code, amount: Math.floor(settings.amount), expiresAt, usedAt: null };
      await kvPutJson(couponKey(code), { shopId, userId, amount: r.coupon.amount, expiresAt, usedAt: null } satisfies CouponRecord, 7 * 86400);
      coupon = r.coupon;
      fresh = true;
    } else if (r.coupon) {
      coupon = r.coupon;
    }
    const adv = grant(r, ["parkour"]);
    await save(shopId, userId, r);
    return { ok: true as const, seconds: Math.round((now - started) / 1000), coupon, fresh, adv };
  });
}

export function normalizeCouponCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^(DS)(\w{4})(\w{4})(\w{4})(\w{4})$/, "$1-$2-$3-$4-$5");
}

/** 자판기 잔액 쿠폰 사용 — 발급받은 본인만 */
export async function redeemWorldCoupon(shopId: string, userId: string, rawCode: string) {
  const code = normalizeCouponCode(rawCode);
  if (!/^DS-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
    return { ok: false as const, error: "쿠폰 번호 형식이 아니에요" };
  }
  return withLock(`coupon:${code}`, async () => {
    const c = await kvGetJson<CouponRecord>(couponKey(code));
    if (!c || c.shopId !== shopId) return { ok: false as const, error: "없는 쿠폰이에요" };
    if (c.userId !== userId) return { ok: false as const, error: "본인에게 발급된 쿠폰만 쓸 수 있어요" };
    if (c.usedAt) return { ok: false as const, error: "이미 사용한 쿠폰이에요" };
    if (Date.now() > new Date(c.expiresAt).getTime()) return { ok: false as const, error: "쿠폰 사용 기한이 지났어요" };
    const usedAt = new Date().toISOString();
    await kvPutJson(couponKey(code), { ...c, usedAt }, 7 * 86400);
    const credited = creditUserPoints(shopId, userId, c.amount, "점프맵 쿠폰");
    if (!credited.ok) {
      await kvPutJson(couponKey(code), c, 7 * 86400);
      return { ok: false as const, error: credited.error };
    }
    await withLock(lockKey(shopId, userId), async () => {
      const r = await load(shopId, userId);
      if (r.coupon?.code === code) r.coupon.usedAt = usedAt;
      await save(shopId, userId, r);
    });
    return { ok: true as const, amount: c.amount, balance: credited.balance };
  });
}

/* ───────────── 제작대 ───────────── */

export type PublicRecipe = {
  id: string;
  productId: string;
  name: string;
  thumbnail: string | null;
  price: number;
  tokens: number;
  inStock: boolean;
};

export function publicRecipes(shopId: string): PublicRecipe[] {
  const products = new Map(listProducts(shopId).map((p) => [p.id, p]));
  return getWorldSettings(shopId)
    .recipes.map((r) => {
      const p = products.get(r.productId);
      if (!p || !p.active) return null;
      return {
        id: r.id,
        productId: p.id,
        name: p.name,
        thumbnail: p.thumbnail,
        price: p.price,
        tokens: r.tokens,
        inStock: p.stockStatus !== "sold_out" || p.fulfillment === "manual",
      };
    })
    .filter((r): r is PublicRecipe => r !== null);
}

/** 토큰을 먼저 빼고, 지급에 실패하면 돌려준다 */
export async function spendTokens(shopId: string, userId: string, amount: number, reason: string) {
  return withLock(lockKey(shopId, userId), async () => {
    const r = await load(shopId, userId);
    if (r.tokens < amount) return { ok: false as const, error: `토큰이 부족해요 (${r.tokens}/${amount})` };
    r.tokens -= amount;
    r.log.push({ at: new Date().toISOString(), delta: -amount, reason });
    await save(shopId, userId, r);
    return { ok: true as const, tokens: r.tokens };
  });
}

export async function refundTokens(shopId: string, userId: string, amount: number, reason: string) {
  await withLock(lockKey(shopId, userId), async () => {
    const r = await load(shopId, userId);
    r.tokens += amount;
    r.log.push({ at: new Date().toISOString(), delta: amount, reason });
    await save(shopId, userId, r);
  });
}

export function recipeById(shopId: string, id: string) {
  const recipe = getWorldSettings(shopId).recipes.find((r) => r.id === id);
  if (!recipe) return null;
  const product = getProductById(recipe.productId);
  return product && product.shopId === shopId && product.active ? { recipe, product } : null;
}

/* ───────────── 내 정보 ───────────── */

/** 월드에 뜨는 이름 = 마인크래프트 닉네임 (없으면 표시 이름) */
export function worldDisplayName(user: { name: string; discordUsername: string | null; minecraftName?: string | null }) {
  return (user.minecraftName || user.name || user.discordUsername || "플레이어").trim().slice(0, 20);
}

export async function worldState(shopId: string, user: ShopUser) {
  await mineSettle(shopId).catch(() => {});
  const r = await load(shopId, user.id);
  const settings = getWorldSettings(shopId);
  return {
    tokens: r.tokens,
    mission: await statusFrom(shopId, user, r),
    coupon: r.coupon,
    couponAvailable: settings.parkourCoupon.enabled && !r.coupon,
    couponAmount: settings.parkourCoupon.amount,
    couponMinutes: settings.parkourCoupon.minutes,
    parkourToday: r.parkourDays.includes(kstDayKey()),
    log: r.log.slice(-12).reverse(),
    adv: r.adv,
  };
}

/* ───────────── 도전 과제 ───────────── */

export async function grantAdvancements(shopId: string, userId: string, ids: AdvId[]) {
  return withLock(lockKey(shopId, userId), async () => {
    const r = await load(shopId, userId);
    const fresh = grant(r, ids);
    if (fresh.length) await save(shopId, userId, r);
    return fresh;
  });
}

/** 월드 안에서 일어난 일(보상 없음)을 클라이언트가 알려 준다 */
export async function claimClientAdvancement(shopId: string, userId: string, id: string) {
  if (!isClientAdv(id)) return { ok: false as const, error: "없는 도전 과제예요" };
  const fresh = await grantAdvancements(shopId, userId, [id]);
  return { ok: true as const, adv: fresh };
}

/* ───────────── 미로 ───────────── */

export const MAZE_TOKENS = 2;
const MAZE_MAX_MS = 30 * 60_000;
type MazeEntry = { u: string; n: string; ms: number };
const mazeTopKey = (shopId: string, day: string) => `mazetop:${shopId}:${day}`;
const publicTop = (list: MazeEntry[]) => list.map(({ n, ms }) => ({ n, ms }));

export async function mazeStatus(shopId: string, userId: string) {
  const day = kstDayKey();
  const [r, top] = await Promise.all([load(shopId, userId), kvGetJson<MazeEntry[]>(mazeTopKey(shopId, day))]);
  return { day, cleared: r.mazeDays.includes(day), best: r.mazeBest[day] ?? null, tokens: MAZE_TOKENS, top: publicTop(top ?? []) };
}

export async function mazeStart(shopId: string, userId: string) {
  return withLock(lockKey(shopId, userId), async () => {
    const r = await load(shopId, userId);
    r.mazeStart = { at: Date.now(), day: kstDayKey() };
    await save(shopId, userId, r);
    return { ok: true as const };
  });
}

export async function mazeFinish(shopId: string, user: ShopUser) {
  const day = kstDayKey();
  const res = await withLock(lockKey(shopId, user.id), async () => {
    const r = await load(shopId, user.id);
    const now = Date.now();
    const s = r.mazeStart;
    if (!s || s.day !== day || now - s.at > MAZE_MAX_MS) return { ok: false as const, error: "출발대에서 다시 시작해 주세요" };
    const ms = now - s.at;
    /* 가장 짧은 길을 전력 질주해도 이보다 빠를 수는 없다 */
    const minMs = (mazeShortestSteps(day) / 5.9) * 1000 * 0.7;
    if (ms < minMs) return { ok: false as const, error: "기록이 너무 빨라요. 처음부터 다시 도전해 주세요" };
    r.mazeStart = null;
    const first = !r.mazeDays.includes(day);
    r.mazeDays = keepDays(r.mazeDays, day);
    const prev = r.mazeBest[day];
    r.mazeBest = Object.fromEntries(Object.entries(r.mazeBest).filter(([d]) => d >= day).slice(-3));
    r.mazeBest[day] = prev === undefined ? ms : Math.min(prev, ms);
    let gained = 0;
    if (first && MAZE_TOKENS > 0) {
      gained = MAZE_TOKENS;
      r.tokens += gained;
      r.log.push({ at: new Date().toISOString(), delta: gained, reason: "미로 탈출" });
    }
    const adv = grant(r, ms <= 60_000 ? ["maze", "maze_fast"] : ["maze"]);
    await save(shopId, user.id, r);
    return { ok: true as const, ms, best: r.mazeBest[day]!, gained, tokens: r.tokens, adv };
  });
  if (!res.ok) return res;

  const top = await withLock(mazeTopKey(shopId, day), async () => {
    const list = (await kvGetJson<MazeEntry[]>(mazeTopKey(shopId, day))) ?? [];
    const mine = list.find((e) => e.u === user.id);
    if (mine) {
      mine.ms = Math.min(mine.ms, res.ms);
      mine.n = worldDisplayName(user);
    } else list.push({ u: user.id, n: worldDisplayName(user), ms: res.ms });
    const next = list.sort((a, b) => a.ms - b.ms).slice(0, 10);
    await kvPutJson(mazeTopKey(shopId, day), next, 3 * 86400);
    return next;
  });
  const rank = top.findIndex((e) => e.u === user.id);
  return { ...res, rank: rank < 0 ? null : rank + 1, top: publicTop(top) };
}

/* ───────────── 보물찾기 ───────────── */

export const TREASURE_TOKENS = 2;
const TREASURE_GAP_MS = 2500;

function treasureToday(r: WorldRecord, day: string) {
  return r.treasure?.day === day ? r.treasure : { day, found: [] as number[], last: 0, claimed: false };
}

export async function treasureState(shopId: string, userId: string) {
  const day = kstDayKey();
  const t = treasureToday(await load(shopId, userId), day);
  return { day, total: TREASURE_PER_DAY, found: t.found, claimed: t.claimed, tokens: TREASURE_TOKENS };
}

export async function treasureFind(shopId: string, userId: string, spot: number) {
  return withLock(lockKey(shopId, userId), async () => {
    const day = kstDayKey();
    if (!treasureSpotsForDay(day).includes(spot)) return { ok: false as const, error: "여기엔 보물이 없어요" };
    const r = await load(shopId, userId);
    const t = treasureToday(r, day);
    const base = { total: TREASURE_PER_DAY, tokens: r.tokens };
    if (t.found.includes(spot)) return { ok: true as const, ...base, found: t.found, claimed: t.claimed, gained: 0, adv: [] as AdvId[] };
    const now = Date.now();
    if (now - t.last < TREASURE_GAP_MS) return { ok: false as const, error: "천천히 찾아 주세요" };
    t.found = [...t.found, spot];
    t.last = now;
    const ids: AdvId[] = ["treasure_1"];
    let gained = 0;
    if (t.found.length >= TREASURE_PER_DAY && !t.claimed) {
      t.claimed = true;
      ids.push("treasure_all");
      if (TREASURE_TOKENS > 0) {
        gained = TREASURE_TOKENS;
        r.tokens += gained;
        r.log.push({ at: new Date().toISOString(), delta: gained, reason: "보물찾기 완료" });
      }
    }
    r.treasure = t;
    const adv = grant(r, ids);
    await save(shopId, userId, r);
    return { ok: true as const, ...base, tokens: r.tokens, found: t.found, claimed: t.claimed, gained, adv };
  });
}

/* ───────────── 광산 (매일 지정 광물 빨리 캐기) ───────────── */

const MINE_MAX_MS = 60 * 60_000;
type MineEntry = { u: string; n: string; ms: number };
type MineWinner = { u: string; n: string; ms: number; paid: boolean };
const mineTopKey = (shopId: string, day: string) => `minetop:${shopId}:${day}`;
const mineWinKey = (shopId: string, day: string) => `minewin:${shopId}:${day}`;
const daysAgo = (n: number) => kstDayKey(new Date(Date.now() - n * 86_400_000));
const settledMemo = new Map<string, string>();

/** 지난 며칠의 1등에게 아직 안 준 토큰을 준다 (누가 들어올 때마다 한 번씩) */
export async function mineSettle(shopId: string) {
  const today = kstDayKey();
  if (settledMemo.get(shopId) === today) return;
  for (let k = 1; k <= 3; k++) {
    const day = daysAgo(k);
    await withLock(mineWinKey(shopId, day), async () => {
      const done = await kvGetJson<MineWinner | { none: true }>(mineWinKey(shopId, day));
      if (done) return;
      const top = (await kvGetJson<MineEntry[]>(mineTopKey(shopId, day))) ?? [];
      const first = top[0];
      if (!first) {
        await kvPutJson(mineWinKey(shopId, day), { none: true }, 30 * 86400);
        return;
      }
      await withLock(lockKey(shopId, first.u), async () => {
        const r = await load(shopId, first.u);
        r.tokens += MINE_TOKENS;
        r.log.push({ at: new Date().toISOString(), delta: MINE_TOKENS, reason: `광산 1등 보상 (${day})` });
        await save(shopId, first.u, r);
      });
      await kvPutJson(mineWinKey(shopId, day), { ...first, paid: true } satisfies MineWinner, 30 * 86400);
    });
  }
  settledMemo.set(shopId, today);
}

export async function mineStatus(shopId: string, userId: string | null) {
  await mineSettle(shopId).catch(() => {});
  const day = kstDayKey();
  const info = mineOfDay(day);
  const [r, top, win] = await Promise.all([
    userId ? load(shopId, userId) : Promise.resolve(null),
    kvGetJson<MineEntry[]>(mineTopKey(shopId, day)),
    kvGetJson<MineWinner | { none: true }>(mineWinKey(shopId, daysAgo(1))),
  ]);
  return {
    day,
    ore: info.ore,
    oreName: info.name,
    need: info.need,
    seed: info.seed,
    tokens: MINE_TOKENS,
    best: r?.mineBest?.[day] ?? null,
    top: (top ?? []).map(({ n, ms }) => ({ n, ms })),
    yesterday: win && "u" in win ? { n: win.n, ms: win.ms } : null,
  };
}

export async function mineStart(shopId: string, userId: string) {
  return withLock(lockKey(shopId, userId), async () => {
    const r = await load(shopId, userId);
    r.mineStart = { at: Date.now(), day: kstDayKey() };
    await save(shopId, userId, r);
    return { ok: true as const };
  });
}

/** cells = 캔 목표 광물 좌표들. 서버가 같은 시드로 광산을 다시 만들어 하나하나 확인한다 */
export async function mineFinish(shopId: string, user: ShopUser, cells: unknown) {
  const day = kstDayKey();
  const info = mineOfDay(day);
  if (!Array.isArray(cells) || cells.length < info.need || cells.length > 4000) return { ok: false as const, error: "캔 광물 기록이 올바르지 않아요" };
  const gen = new MineGen(info.seed);
  const seen = new Set<string>();
  for (const c of cells) {
    if (!Array.isArray(c) || c.length !== 3 || !c.every((v) => Number.isInteger(v))) return { ok: false as const, error: "캔 광물 기록이 올바르지 않아요" };
    const [x, y, z] = c as [number, number, number];
    const k = `${x},${y},${z}`;
    if (seen.has(k)) continue;
    if (!gen.isTarget(info.ore, x, y, z)) return { ok: false as const, error: "오늘의 광물이 아닌 블록이 섞여 있어요" };
    seen.add(k);
  }
  if (seen.size < info.need) return { ok: false as const, error: `${info.name} 광석을 ${info.need}개 캐야 해요` };

  const res = await withLock(lockKey(shopId, user.id), async () => {
    const r = await load(shopId, user.id);
    const s = r.mineStart;
    const now = Date.now();
    if (!s || s.day !== day || now - s.at > MINE_MAX_MS) return { ok: false as const, error: "광산 입구에서 다시 시작해 주세요" };
    const ms = now - s.at;
    /* 다이아몬드 곡괭이로 쉬지 않고 캐도 이보다 빠를 수는 없다 */
    const minMs = info.need * 600 + 5000;
    if (ms < minMs) return { ok: false as const, error: "기록이 너무 빨라요. 처음부터 다시 도전해 주세요" };
    r.mineStart = null;
    const prev = r.mineBest[day];
    r.mineBest = Object.fromEntries(Object.entries(r.mineBest).filter(([d]) => d >= daysAgo(3)).slice(-3));
    r.mineBest[day] = prev === undefined ? ms : Math.min(prev, ms);
    await save(shopId, user.id, r);
    return { ok: true as const, ms, best: r.mineBest[day]! };
  });
  if (!res.ok) return res;

  const top = await withLock(mineTopKey(shopId, day), async () => {
    const list = (await kvGetJson<MineEntry[]>(mineTopKey(shopId, day))) ?? [];
    const mine = list.find((e) => e.u === user.id);
    if (mine) {
      mine.ms = Math.min(mine.ms, res.ms);
      mine.n = worldDisplayName(user);
    } else list.push({ u: user.id, n: worldDisplayName(user), ms: res.ms });
    const next = list.sort((a, b) => a.ms - b.ms).slice(0, 10);
    await kvPutJson(mineTopKey(shopId, day), next, 8 * 86400);
    return next;
  });
  const rank = top.findIndex((e) => e.u === user.id);
  return { ...res, rank: rank < 0 ? null : rank + 1, top: top.map(({ n, ms }) => ({ n, ms })), tokens: MINE_TOKENS };
}
