import { kvGetJson, kvPutJson } from "./kv";

export type McProfile = {
  uuid: string;
  name: string;
  skinUrl: string | null;
  slim: boolean;
};

export type HypixelStats = {
  rank: string | null;
  rankColor: string;
  level: number;
  karma: number;
  achievementPoints: number;
  firstLogin: string | null;
  lastLogin: string | null;
  online: boolean | null;
  bedwars: { stars: number; wins: number; finalKills: number; fkdr: number };
  skywars: { level: string; wins: number; kills: number; kdr: number };
  duels: { wins: number; kills: number };
};

const UUID_RE = /^[0-9a-f]{32}$/;

export function normalizeUuid(raw: string | null | undefined) {
  const v = (raw ?? "").toLowerCase().replace(/-/g, "");
  return UUID_RE.test(v) ? v : null;
}

export function isValidIgn(ign: string) {
  return /^[A-Za-z0-9_]{3,16}$/.test(ign);
}

async function hypixelKey() {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const key = (env as { HYPIXEL_API_KEY?: string }).HYPIXEL_API_KEY?.trim();
    if (key) return key;
  } catch {
    /* local */
  }
  return process.env.HYPIXEL_API_KEY?.trim() || "";
}

export async function hypixelConfigured() {
  return Boolean(await hypixelKey());
}

/** 닉네임 → UUID (Mojang) */
export async function resolveIgn(ign: string): Promise<{ uuid: string; name: string } | null> {
  if (!isValidIgn(ign)) return null;
  const name = encodeURIComponent(ign);
  /* Cloudflare 쪽 IP 가 api.mojang.com 에서 막히는 경우가 있어 같은 데이터를 주는 곳을 차례로 묻는다 */
  const sources = [
    `https://api.mojang.com/users/profiles/minecraft/${name}`,
    `https://api.minecraftservices.com/minecraft/profile/lookup/name/${name}`,
  ];
  for (const url of sources) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (res.status === 404 || res.status === 204) return null;
      if (!res.ok) continue;
      const data = (await res.json().catch(() => null)) as { id?: string; name?: string } | null;
      const uuid = normalizeUuid(data?.id);
      if (uuid && data?.name) return { uuid, name: data.name };
    } catch {
      /* 다음 곳에 묻는다 */
    }
  }
  try {
    const res = await fetch(`https://playerdb.co/api/player/minecraft/${name}`, {
      headers: { "User-Agent": "doesmc.xyz" },
      signal: AbortSignal.timeout(6000),
    });
    const data = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: { player?: { raw_id?: string; username?: string } };
    } | null;
    const uuid = normalizeUuid(data?.data?.player?.raw_id);
    const found = data?.data?.player?.username;
    if (data?.success && uuid && found) return { uuid, name: found };
  } catch {
    /* 조회 실패 */
  }
  return null;
}

/** UUID → 현재 닉네임 + 스킨 (6시간 캐시) */
export async function profileByUuid(uuid: string): Promise<McProfile | null> {
  const id = normalizeUuid(uuid);
  if (!id) return null;
  const cacheKey = `mc:profile:${id}`;
  const cached = await kvGetJson<McProfile>(cacheKey);
  if (cached) return cached;

  const res = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${id}`, {
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as {
    id?: string;
    name?: string;
    properties?: { name: string; value: string }[];
  } | null;
  if (!data?.name) return null;
  let skinUrl: string | null = null;
  let slim = false;
  const tex = data.properties?.find((p) => p.name === "textures");
  if (tex) {
    try {
      const decoded = JSON.parse(atob(tex.value)) as {
        textures?: { SKIN?: { url?: string; metadata?: { model?: string } } };
      };
      const url = decoded.textures?.SKIN?.url ?? null;
      skinUrl = url ? url.replace(/^http:/, "https:") : null;
      slim = decoded.textures?.SKIN?.metadata?.model === "slim";
    } catch {
      /* 기본 스킨 */
    }
  }
  const profile: McProfile = { uuid: id, name: data.name, skinUrl, slim };
  await kvPutJson(cacheKey, profile, 6 * 3600);
  return profile;
}

const RANK_LABEL: Record<string, [string, string]> = {
  VIP: ["VIP", "#55FF55"],
  VIP_PLUS: ["VIP+", "#55FF55"],
  MVP: ["MVP", "#55FFFF"],
  MVP_PLUS: ["MVP+", "#55FFFF"],
  SUPERSTAR: ["MVP++", "#FFAA00"],
  YOUTUBER: ["YOUTUBE", "#FF5555"],
  ADMIN: ["ADMIN", "#FF5555"],
  GAME_MASTER: ["GM", "#00AA00"],
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const ratio = (a: number, b: number) => Math.round((b > 0 ? a / b : a) * 100) / 100;

/** Hypixel 스탯 (30분 캐시). 키가 없으면 null */
export async function hypixelStats(uuid: string): Promise<HypixelStats | null> {
  const id = normalizeUuid(uuid);
  if (!id) return null;
  const key = await hypixelKey();
  if (!key) return null;
  const cacheKey = `mc:hypixel:${id}`;
  const cached = await kvGetJson<HypixelStats | { none: true }>(cacheKey);
  if (cached) return "none" in cached ? null : cached;

  const res = await fetch(`https://api.hypixel.net/v2/player?uuid=${id}`, {
    headers: { "API-Key": key },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { player?: Record<string, unknown> | null } | null;
  const p = data?.player;
  if (!p) {
    await kvPutJson(cacheKey, { none: true }, 1800);
    return null;
  }
  const stats = (p.stats ?? {}) as Record<string, Record<string, unknown>>;
  const bw = stats.Bedwars ?? {};
  const sw = stats.SkyWars ?? {};
  const du = stats.Duels ?? {};
  const ach = (p.achievements ?? {}) as Record<string, unknown>;

  let rankKey: string | null = null;
  if (typeof p.rank === "string" && p.rank !== "NORMAL") rankKey = p.rank;
  else if (p.monthlyPackageRank === "SUPERSTAR") rankKey = "SUPERSTAR";
  else if (typeof p.newPackageRank === "string" && p.newPackageRank !== "NONE") rankKey = p.newPackageRank;
  else if (typeof p.packageRank === "string" && p.packageRank !== "NONE") rankKey = p.packageRank;
  const rank = rankKey ? RANK_LABEL[rankKey] ?? [rankKey, "#AAAAAA"] : null;

  const exp = num(p.networkExp);
  const level = Math.floor((Math.sqrt(2 * exp + 30625) / 50 - 2.5) * 100) / 100;
  const fk = num(bw.final_kills_bedwars);
  const fd = num(bw.final_deaths_bedwars);
  const swk = num(sw.kills);
  const swd = num(sw.deaths);
  const iso = (v: unknown) => (typeof v === "number" ? new Date(v).toISOString() : null);

  const out: HypixelStats = {
    rank: rank?.[0] ?? null,
    rankColor: rank?.[1] ?? "#AAAAAA",
    level: Math.max(1, level),
    karma: num(p.karma),
    achievementPoints: num(p.achievementPoints),
    firstLogin: iso(p.firstLogin),
    lastLogin: iso(p.lastLogin),
    online: typeof p.lastLogin === "number" && typeof p.lastLogout === "number" ? p.lastLogin > p.lastLogout : null,
    bedwars: { stars: num(ach.bedwars_level), wins: num(bw.wins_bedwars), finalKills: fk, fkdr: ratio(fk, fd) },
    skywars: {
      level: typeof sw.levelFormatted === "string" ? sw.levelFormatted.replace(/§./g, "") : "-",
      wins: num(sw.wins),
      kills: swk,
      kdr: ratio(swk, swd),
    },
    duels: { wins: num(du.wins), kills: num(du.kills) },
  };
  await kvPutJson(cacheKey, out, 1800);
  return out;
}
