/**
 * DOES 닉네임 조회 (한국판 NameMC)
 *
 * - 닉네임 또는 UUID → UUID · 현재 닉네임 · 스킨(원본 · 슬림 여부) · 보유 망토(capes.me) · OptiFine 망토 · 하이픽셀 요약
 * - 모장이 닉네임 이력 API 를 없애서, DOES 가 조회할 때마다 본 닉네임 · 스킨을 기록해 "DOES 기록 이력"으로 보여준다
 * - 없는 닉네임이면 "사용 가능할 수 있는 닉네임"으로 알려준다
 * - 인기 검색(조회수) · 최근 검색
 */
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";

export type NameHistory = {
  uuid: string;
  names: { name: string; firstSeen: string; lastSeen: string }[];
  skins: { hash: string; url: string; slim: boolean; firstSeen: string }[];
  views: number;
  lastLookup: string;
};

type PopDb = { counts: Record<string, { name: string; n: number; at: string }>; recent: { uuid: string; name: string; at: string }[] };
const histKey = (uuid: string) => `namemc:v1:${uuid}`;
const POP_KEY = "namemc:pop:v1";

export type LookupResult =
  | { found: false; name: string; available: boolean }
  | {
      found: true;
      uuid: string;
      name: string;
      skinUrl: string | null;
      slim: boolean;
      renderUrl: string;
      headUrl: string;
      capes: { title: string; url: string; source: "minecraft" | "optifine" }[];
      hypixel: { rank: string | null; rankColor: string; level: number; bedwarsStars: number; lastLogin: string | null } | null;
      history: NameHistory;
    };

const UUID_RE = /^[0-9a-f]{32}$/;
export function isNameOrUuid(q: string) {
  const v = q.trim().replace(/-/g, "").toLowerCase();
  return UUID_RE.test(v) || /^[A-Za-z0-9_]{1,16}$/.test(q.trim());
}

export async function lookupPlayer(query: string): Promise<LookupResult> {
  const q = query.trim();
  const [{ resolveMcProfile }, { profileByUuid, hypixelStats, normalizeUuid }] = await Promise.all([import("@/lib/mc-profile-server"), import("@/lib/world/minecraft")]);
  let uuid = normalizeUuid(q);
  let name = q;
  if (uuid) {
    const p = await profileByUuid(uuid);
    if (!p) return { found: false, name: q, available: false };
    name = p.name;
  }
  const resolved = await resolveMcProfile(name);
  uuid = uuid ?? resolved?.uuid ?? null;
  if (!uuid) return { found: false, name: q, available: /^[A-Za-z0-9_]{3,16}$/.test(q) };
  const [profile, hyp] = await Promise.all([profileByUuid(uuid), hypixelStats(uuid).catch(() => null)]);
  const realName = profile?.name ?? resolved?.name ?? name;
  const history = await record(uuid, realName, profile?.skinUrl ?? null, Boolean(profile?.slim));
  return {
    found: true,
    uuid,
    name: realName,
    skinUrl: profile?.skinUrl ?? null,
    slim: Boolean(profile?.slim),
    renderUrl: `https://doesmc.xyz/api/discord/skin/${uuid}.png`,
    headUrl: `https://mc-heads.net/avatar/${uuid}/64`,
    capes: (resolved?.capes ?? []).map((c) => ({ title: c.title ?? (c.source === "optifine" ? "OptiFine" : "망토"), url: c.url, source: c.source === "optifine" ? "optifine" : "minecraft" })),
    hypixel: hyp ? { rank: hyp.rank, rankColor: hyp.rankColor, level: hyp.level, bedwarsStars: hyp.bedwars.stars, lastLogin: hyp.lastLogin } : null,
    history,
  };
}

/** 조회할 때마다 닉네임 · 스킨 이력과 인기 순위를 기록한다 */
async function record(uuid: string, name: string, skinUrl: string | null, slim: boolean) {
  const now = new Date().toISOString();
  const h = await withLock(histKey(uuid), async () => {
    const h = (await kvGetJson<NameHistory>(histKey(uuid))) ?? { uuid, names: [], skins: [], views: 0, lastLookup: now };
    const cur = h.names.find((n) => n.name === name);
    if (cur) cur.lastSeen = now;
    else h.names.unshift({ name, firstSeen: now, lastSeen: now });
    if (skinUrl) {
      const hash = skinUrl.split("/").pop() ?? skinUrl;
      if (!h.skins.some((s) => s.hash === hash)) h.skins.unshift({ hash, url: skinUrl, slim, firstSeen: now });
      h.skins = h.skins.slice(0, 30);
    }
    h.views += 1;
    h.lastLookup = now;
    await kvPutJson(histKey(uuid), h);
    return h;
  });
  await withLock(POP_KEY, async () => {
    const p = (await kvGetJson<PopDb>(POP_KEY)) ?? { counts: {}, recent: [] };
    const c = (p.counts[uuid] ??= { name, n: 0, at: now });
    c.name = name;
    c.n += 1;
    c.at = now;
    p.recent = [{ uuid, name, at: now }, ...p.recent.filter((r) => r.uuid !== uuid)].slice(0, 24);
    const entries = Object.entries(p.counts);
    if (entries.length > 400) p.counts = Object.fromEntries(entries.sort((a, b) => b[1].n - a[1].n).slice(0, 300));
    await kvPutJson(POP_KEY, p);
  }).catch(() => null);
  return h;
}

export async function popularPlayers() {
  const p = (await kvGetJson<PopDb>(POP_KEY)) ?? { counts: {}, recent: [] };
  return {
    popular: Object.entries(p.counts)
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 12)
      .map(([uuid, v]) => ({ uuid, name: v.name, views: v.n })),
    recent: p.recent.slice(0, 12),
  };
}
