import type { VerifyEvent, VerifyGuild } from "@/lib/verify-bot/types";

export type SuspicionBreakdown = {
  score: number;
  level: "low" | "medium" | "high" | "critical";
  parts: { key: string; label: string; points: number }[];
};

/** 0–100 risk score from recent verify events + guild counters. */
export function computeSuspicionScore(
  guild: Pick<
    VerifyGuild,
    "verifiesToday" | "blockedToday" | "verifyTotal" | "blockedTotal"
  >,
  recentEvents: VerifyEvent[],
): SuspicionBreakdown {
  const parts: SuspicionBreakdown["parts"] = [];
  const last24 = recentEvents.filter(
    (e) => Date.now() - new Date(e.createdAt).getTime() < 86400_000,
  );
  const blocked = last24.filter((e) => e.status === "blocked");
  const ok = last24.filter((e) => e.status === "ok");

  const blockRate = last24.length ? blocked.length / last24.length : 0;
  if (blockRate > 0) {
    const pts = Math.min(35, Math.round(blockRate * 40));
    parts.push({ key: "block_rate", label: "차단율", points: pts });
  }

  const vpnHits = last24.filter((e) =>
    e.flags.some((f) => f.includes("vpn") || f.includes("proxy") || f.includes("hosting")),
  ).length;
  if (vpnHits > 0) {
    parts.push({
      key: "vpn",
      label: "VPN/프록시 신호",
      points: Math.min(25, vpnHits * 3),
    });
  }

  const ageHits = last24.filter((e) => e.flags.includes("age") || e.reason === "account_age").length;
  if (ageHits > 0) {
    parts.push({ key: "age", label: "신규 계정", points: Math.min(20, ageHits * 4) });
  }

  const dup = last24.filter((e) => e.reason === "duplicate_ip" || e.flags.includes("dup_ip")).length;
  if (dup > 0) {
    parts.push({ key: "dup_ip", label: "중복 IP", points: Math.min(20, dup * 5) });
  }

  const foreign = last24.filter((e) => e.reason === "foreign").length;
  if (foreign > 0) {
    parts.push({ key: "foreign", label: "외국 IP 차단", points: Math.min(15, foreign * 2) });
  }

  // volume spike vs quiet baseline
  if (guild.blockedToday >= 10 && guild.blockedToday > guild.verifiesToday) {
    parts.push({ key: "spike", label: "오늘 차단 급증", points: 15 });
  }

  if (ok.length === 0 && blocked.length >= 5) {
    parts.push({ key: "all_block", label: "성공 없이 차단만", points: 10 });
  }

  const score = Math.min(100, parts.reduce((s, p) => s + p.points, 0));
  const level =
    score >= 75 ? "critical" : score >= 50 ? "high" : score >= 25 ? "medium" : "low";
  return { score, level, parts };
}

export function buildHourlyHeatmap(events: VerifyEvent[], days = 7) {
  // 7d x 24h counts for ok verifies
  const grid: number[][] = Array.from({ length: days }, () => Array.from({ length: 24 }, () => 0));
  const now = Date.now();
  const start = now - days * 86400_000;
  for (const e of events) {
    if (e.status !== "ok") continue;
    const t = new Date(e.createdAt).getTime();
    if (t < start) continue;
    const dayIdx = Math.min(days - 1, Math.floor((t - start) / 86400_000));
    const hour = new Date(e.createdAt).getUTCHours();
    grid[dayIdx]![hour]! += 1;
  }
  return { days, grid, tz: "UTC" };
}

export function topBlockedCountries(events: VerifyEvent[], limit = 10) {
  const map = new Map<string, number>();
  for (const e of events) {
    if (e.status !== "blocked") continue;
    const cc = e.country || "??";
    map.set(cc, (map.get(cc) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([country, count]) => ({ country, count }));
}

export function topBlockedAsns(events: VerifyEvent[], limit = 10) {
  const map = new Map<string, number>();
  for (const e of events) {
    if (e.status !== "blocked") continue;
    const asn = e.flags.find((f) => f.startsWith("asn:"))?.slice(4) || null;
    if (!asn) continue;
    map.set(asn, (map.get(asn) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([asn, count]) => ({ asn, count }));
}

export function topSources(
  events: VerifyEvent[],
  limit = 10,
): { key: string; label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const e of events) {
    if (e.status !== "ok") continue;
    const ch = e.flags.find((f) => f.startsWith("ch:"))?.slice(3);
    const camp = e.flags.find((f) => f.startsWith("camp:"))?.slice(5);
    const key = camp ? `camp:${camp}` : ch ? `ch:${ch}` : "unknown";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({
      key,
      label: key.startsWith("camp:")
        ? `캠페인 ${key.slice(5)}`
        : key.startsWith("ch:")
          ? `채널 ${key.slice(3)}`
          : "미분류",
      count,
    }));
}
