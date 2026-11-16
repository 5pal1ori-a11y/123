/** 닉네임 변경 가능 여부(laby.net 이름 기록) · 도넛SMP 통계 — 실패하면 null (화면에서 숨김) */
import type { McDonutStats, McNameChange } from "@/lib/mc-account";
import { getApiKey } from "@/lib/api-keys";

const DAY = 86_400_000;

/** 닉네임 기록에서 가장 최근 변경 시각을 찾는다 (응답 모양이 조금 달라도 읽히게) */
function latestChange(data: unknown): string | null | undefined {
  const arr = (data as { username_history?: unknown; name_history?: unknown; history?: unknown } | null) ?? null;
  const list = (arr && (arr.username_history ?? arr.name_history ?? arr.history)) as unknown;
  if (!Array.isArray(list)) return undefined;
  let best = 0;
  for (const e of list as Record<string, unknown>[]) {
    const raw = e.changed_at ?? e.changedAt ?? e.changedToAt ?? e.date;
    const t = typeof raw === "number" ? raw : typeof raw === "string" ? Date.parse(raw) : NaN;
    if (Number.isFinite(t) && t > best) best = t;
  }
  return best ? new Date(best).toISOString() : null;
}

export async function lookupNameChange(uuid: string): Promise<McNameChange | null> {
  const dashed = uuid.includes("-") ? uuid : uuid.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
  try {
    const res = await fetch(`https://laby.net/api/v3/user/${dashed}/profile`, {
      headers: { accept: "application/json", "user-agent": "DOES-shop/1.0" },
      signal: AbortSignal.timeout(6000),
      cf: { cacheTtl: 3600, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) return null;
    const last = latestChange(await res.json().catch(() => null));
    if (last === undefined) return null;
    if (last === null) return { lastChangedAt: null, available: true, availableAt: null };
    const at = new Date(last).getTime() + 30 * DAY;
    return { lastChangedAt: last, available: Date.now() >= at, availableAt: new Date(at).toISOString() };
  } catch {
    return null;
  }
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export async function lookupDonutStats(name: string): Promise<McDonutStats | null> {
  const key = await getApiKey("donut");
  if (!key) return null;
  const url = `https://api.donutsmp.net/v1/stats/${encodeURIComponent(name)}`;
  try {
    let res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, accept: "application/json" }, signal: AbortSignal.timeout(6000) });
    if (res.status === 401 || res.status === 403) {
      res = await fetch(url, { headers: { Authorization: key, accept: "application/json" }, signal: AbortSignal.timeout(6000) });
    }
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as { result?: Record<string, unknown> } | Record<string, unknown> | null;
    const r = ((data as { result?: Record<string, unknown> })?.result ?? data) as Record<string, unknown> | null;
    if (!r) return null;
    const play = num(r.playtime);
    return {
      money: num(r.money),
      kills: num(r.kills),
      deaths: num(r.deaths),
      shards: num(r.shards),
      // 도넛 playtime 은 밀리초
      playtimeHours: play === null ? null : Math.round(play / 3_600_000),
    };
  } catch {
    return null;
  }
}
