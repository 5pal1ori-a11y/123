import { getKvBinding } from "@/lib/db-persist";
import { getReviewFeed } from "@/lib/review-feed";
import { getStoreForRead, getUserByDiscordId, getUserById } from "@/lib/store";
import type { ShopUser } from "@/lib/types";
import {
  STARTER_ALLOWANCE,
  STARTER_BLOCKS,
  decoForKey,
  islandLevel,
  validateLayout,
  withStarterPlot,
  type Allowance,
  type IslandStats,
  type IslandView,
  type ItemId,
  type PlacedBlock,
} from "./world";

type IslandRecord = {
  v: 1;
  /** 1 = 넓어진 기본 부지를 받음 */
  plot?: 1;
  blocks: PlacedBlock[];
  /** 활동으로 얻은 아이템 누적 (기본 지급 제외) */
  earned: Allowance;
  /** 이미 보상한 활동 키 — 중복 지급 방지 */
  ledger: string[];
  stats: IslandStats;
  createdAt: string;
  updatedAt: string;
};

type Reward = { key: string; item: ItemId; stat: keyof Omit<IslandStats, "verified"> | "verified" };

const memoryKv = new Map<string, string>();

async function kvGet(key: string) {
  const kv = await getKvBinding();
  return kv ? kv.get(key) : (memoryKv.get(key) ?? null);
}

async function kvPut(key: string, value: string) {
  const kv = await getKvBinding();
  if (kv) await kv.put(key, value);
  else memoryKv.set(key, value);
}

const recordKey = (shopId: string, userId: string) => `island:${shopId}:${userId}`;

function freshRecord(): IslandRecord {
  const now = new Date().toISOString();
  return {
    v: 1,
    plot: 1,
    blocks: STARTER_BLOCKS.map((b) => [...b] as PlacedBlock),
    earned: {},
    ledger: [],
    stats: { attendance: 0, reviews: 0, orders: 0, events: 0, verified: false },
    createdAt: now,
    updatedAt: now,
  };
}

/** dirty = 불러오면서 고친 내용이 있어 저장해야 함 */
async function loadRecord(shopId: string, userId: string): Promise<{ record: IslandRecord; dirty: boolean }> {
  const raw = await kvGet(recordKey(shopId, userId));
  if (!raw) return { record: freshRecord(), dirty: false };
  try {
    const parsed = JSON.parse(raw) as IslandRecord;
    if (parsed?.v !== 1 || !Array.isArray(parsed.blocks)) return { record: freshRecord(), dirty: false };
    parsed.ledger ??= [];
    parsed.earned ??= {};
    parsed.stats ??= { attendance: 0, reviews: 0, orders: 0, events: 0, verified: false };
    if (parsed.plot !== 1) {
      parsed.blocks = withStarterPlot(parsed.blocks, allowanceOf(parsed));
      parsed.plot = 1;
      return { record: parsed, dirty: true };
    }
    return { record: parsed, dirty: false };
  } catch {
    return { record: freshRecord(), dirty: false };
  }
}

async function saveRecord(shopId: string, userId: string, record: IslandRecord) {
  record.updatedAt = new Date().toISOString();
  await kvPut(recordKey(shopId, userId), JSON.stringify(record));
}

export function allowanceOf(record: IslandRecord): Allowance {
  const out: Allowance = { ...STARTER_ALLOWANCE };
  for (const [id, n] of Object.entries(record.earned) as [ItemId, number][]) out[id] = (out[id] ?? 0) + n;
  return out;
}

async function collectRewards(shopId: string, user: ShopUser, skipFeed = false): Promise<Reward[]> {
  const store = getStoreForRead();
  const rewards: Reward[] = [];

  for (const c of store.randomBoxClaims) {
    if (c.shopId === shopId && c.userId === user.id) rewards.push({ key: `a:${c.dayKey}`, item: "grass", stat: "attendance" });
  }

  for (const r of store.reviews) {
    if (r.shopId === shopId && r.userId === user.id && r.approved) rewards.push({ key: `r:s_${r.id}`, item: "tree", stat: "reviews" });
  }
  if (user.discordId && !skipFeed) {
    try {
      const feed = await getReviewFeed(shopId);
      for (const item of feed.items) {
        if (item.source === "discord" && item.authorId === user.discordId) {
          rewards.push({ key: `r:${item.id}`, item: "tree", stat: "reviews" });
        }
      }
    } catch {
      /* 디스코드 후기는 다음 동기화 때 반영 */
    }
  }

  const events = store.events.filter((e) => e.shopId === shopId);
  for (const o of store.orders) {
    if (o.shopId !== shopId || o.userId !== user.id || o.status !== "dispensed") continue;
    rewards.push({ key: `o:${o.id}`, item: "diamond", stat: "orders" });
    const at = new Date(o.createdAt).getTime();
    for (const ev of events) {
      if (ev.productId && ev.productId !== o.productId) continue;
      if (at >= new Date(ev.startsAt).getTime() && at <= new Date(ev.endsAt).getTime()) {
        rewards.push({ key: `e:${ev.id}`, item: decoForKey(ev.id), stat: "events" });
      }
    }
  }

  if (user.discordId) rewards.push({ key: "v:discord", item: "flag", stat: "verified" });
  return rewards;
}

function applyRewards(record: IslandRecord, rewards: Reward[]) {
  const seen = new Set(record.ledger);
  let changed = false;
  for (const r of rewards) {
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    record.ledger.push(r.key);
    record.earned[r.item] = (record.earned[r.item] ?? 0) + 1;
    if (r.stat === "verified") record.stats.verified = true;
    else record.stats[r.stat] += 1;
    changed = true;
  }
  return changed;
}

/** 활동 내역을 훑어 새로 얻은 블록을 지급하고 섬을 돌려준다 */
export async function syncIsland(shopId: string, user: ShopUser, opts?: { skipFeed?: boolean }) {
  const { record, dirty } = await loadRecord(shopId, user.id);
  const rewards = await collectRewards(shopId, user, opts?.skipFeed);
  if (applyRewards(record, rewards) || dirty) await saveRecord(shopId, user.id, record);
  return record;
}

/** 떠돌이 상인 Deal 등 즉시 지급 */
export async function grantIslandReward(shopId: string, userId: string, key: string, item: ItemId) {
  const { record, dirty } = await loadRecord(shopId, userId);
  if (applyRewards(record, [{ key, item, stat: "events" }]) || dirty) await saveRecord(shopId, userId, record);
}

export async function saveIslandLayout(shopId: string, user: ShopUser, rawBlocks: unknown) {
  const record = await syncIsland(shopId, user);
  const result = validateLayout(rawBlocks, allowanceOf(record));
  if (!result.ok) return result;
  record.blocks = result.blocks;
  await saveRecord(shopId, user.id, record);
  return { ok: true as const, record };
}

export function islandView(record: IslandRecord, user: ShopUser, mine: boolean): IslandView {
  return {
    userId: user.id,
    owner: {
      name: user.minecraftName || user.discordUsername || user.name || "회원",
      discordUsername: user.discordUsername,
      discordId: user.discordId,
    },
    blocks: record.blocks,
    allowance: allowanceOf(record),
    stats: record.stats,
    level: islandLevel(record.stats),
    updatedAt: record.updatedAt,
    mine,
  };
}

/** userId · 디스코드 ID · 닉네임(마인크래프트 닉네임 우선)으로 회원 찾기 */
export function findIslandOwner(shopId: string, id: string): ShopUser | null {
  const byId = getUserById(id);
  if (byId && byId.shopId === shopId) return byId;
  if (/^\d{15,22}$/.test(id)) return getUserByDiscordId(shopId, id);
  const name = id.trim().replace(/^@/, "").toLowerCase();
  if (!name || name.length > 40) return null;
  const users = getStoreForRead().users.filter((u) => u.shopId === shopId && !u.banned);
  return (
    users.find((u) => u.minecraftName?.toLowerCase() === name) ??
    users.find((u) => u.name?.trim().toLowerCase() === name) ??
    users.find((u) => u.discordUsername?.toLowerCase() === name) ??
    null
  );
}
