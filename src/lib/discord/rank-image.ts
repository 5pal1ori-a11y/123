/**
 * 구매 랭킹 이미지 — 순위 · 디스코드 이름 · 프로필 사진 · 금액을 한 장의 PNG 로.
 * 그림은 별도 워커(does-rank-image, 서비스 바인딩 RANK_IMG)가 그린다.
 * 디스코드는 같은 주소 이미지를 오래 캐시하므로, 내용이 바뀌면 주소(해시)도 바뀐다.
 */
import { doesDiscordEnvAsync } from "@/lib/discord/does-env";
import { purchaseRanking } from "@/lib/discord/leaderboard-board";
import { getShopById, getShopSettings, MFA_DISCORD_GUILD_ID } from "@/lib/store";
import { kvGetJson, kvPutJson } from "@/lib/world/kv";

type Who = { name: string; avatar: string | null; at: number };
const NAME_KEY = "rank-image:names:v1";
const NAME_TTL = 6 * 3_600_000;

export type RankImageData = {
  kind: "purchase" | "invite";
  title: string;
  statLabel: string;
  statValue: string;
  note: string;
  updated: string;
  rows: { rank: number; name: string; avatar: string | null; amount: number; count: number; share: number }[];
};

async function resolveNames(guildId: string, ids: string[]) {
  const cache = (await kvGetJson<Record<string, Who>>(NAME_KEY).catch(() => null)) ?? {};
  const token = (await doesDiscordEnvAsync()).botToken;
  let changed = false;
  for (const id of ids) {
    const c = cache[id];
    if (c && Date.now() - c.at < NAME_TTL) continue;
    if (!token) break;
    const r = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${id}`, { headers: { Authorization: `Bot ${token}` } }).catch(() => null);
    let who: Who | null = null;
    if (r?.ok) {
      const m = (await r.json()) as { nick?: string | null; avatar?: string | null; user?: { id: string; username: string; global_name?: string | null; avatar?: string | null } };
      const u = m.user;
      const avatar = m.avatar
        ? `https://cdn.discordapp.com/guilds/${guildId}/users/${id}/avatars/${m.avatar}.png?size=128`
        : u?.avatar
          ? `https://cdn.discordapp.com/avatars/${id}/${u.avatar}.png?size=128`
          : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(id) >> BigInt(22)) % 6}.png`;
      who = { name: (m.nick || u?.global_name || u?.username || "회원").slice(0, 24), avatar, at: Date.now() };
    } else if (r && r.status === 404) {
      // 서버를 나간 회원 — 유저 정보로
      const ur = await fetch(`https://discord.com/api/v10/users/${id}`, { headers: { Authorization: `Bot ${token}` } }).catch(() => null);
      const u = ur?.ok ? ((await ur.json()) as { username: string; global_name?: string | null; avatar?: string | null }) : null;
      who = { name: (u?.global_name || u?.username || "회원").slice(0, 24), avatar: u?.avatar ? `https://cdn.discordapp.com/avatars/${id}/${u.avatar}.png?size=128` : null, at: Date.now() };
    }
    if (who) {
      cache[id] = who;
      changed = true;
    }
  }
  if (changed) await kvPutJson(NAME_KEY, cache).catch(() => null);
  return cache;
}

function stamp() {
  const now = new Date(Date.now() + 9 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}.${pad(now.getUTCMonth() + 1)}.${pad(now.getUTCDate())}  ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())} 갱신`;
}

export async function inviteImageData(shopId: string, guildId: string): Promise<RankImageData> {
  const shop = getShopById(shopId);
  const { inviteRankData } = await import("@/lib/discord/invites");
  const { top, participants, total } = await inviteRankData(guildId);
  const names = await resolveNames(guildId, top.map((r) => r.id));
  return {
    kind: "invite",
    title: `${shop?.name ?? "DOES"} 초대 랭킹`,
    statLabel: `참여 ${participants.toLocaleString("ko-KR")}명`,
    statValue: `총 초대 ${total.toLocaleString("ko-KR")}명`,
    note: "실제 남아 있는 인원 기준 · 나간 사람은 빼고 셉니다",
    updated: stamp(),
    rows: top.map((r, i) => ({
      rank: i + 1,
      name: names[r.id]?.name ?? "회원",
      avatar: names[r.id]?.avatar ?? null,
      amount: r.n,
      count: r.joins,
      share: total > 0 ? r.n / total : 0,
    })),
  };
}

export async function rankImageData(shopId: string): Promise<RankImageData> {
  const shop = getShopById(shopId);
  const guildId = getShopSettings(shopId).discordGuildId || MFA_DISCORD_GUILD_ID;
  const { top, total, people } = purchaseRanking(shopId);
  const names = await resolveNames(guildId, top.flatMap((r) => (r.discordId ? [r.discordId] : [])));
  return {
    kind: "purchase",
    title: `${shop?.name ?? "DOES"} 구매 랭킹`,
    statLabel: `구매자 ${people.toLocaleString("ko-KR")}명`,
    statValue: `누적 ₩${total.toLocaleString("ko-KR")}`,
    note: "비율은 전체 누적 구매 금액 기준",
    updated: stamp(),
    rows: top.map((r, i) => {
      const who = r.discordId ? names[r.discordId] : undefined;
      return {
        rank: i + 1,
        name: who?.name ?? r.plain,
        avatar: who?.avatar ?? null,
        amount: r.amount,
        count: r.count,
        share: total > 0 ? r.amount / total : 0,
      };
    }),
  };
}

async function hashOf(d: RankImageData) {
  const { updated: _u, ...rest } = d;
  void _u;
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`v3:${JSON.stringify(rest)}`));
  return [...new Uint8Array(buf)].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function rankBinding() {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return ((env as Record<string, unknown>).RANK_IMG as { fetch: (url: string, init?: RequestInit) => Promise<Response> } | undefined) ?? null;
  } catch {
    return null;
  }
}

/** 구매 랭킹판에 넣을 이미지 주소 (이미지 워커가 없으면 null) */
export async function rankImageUrl(shopId: string) {
  if (!(await rankBinding())) return null;
  const shop = getShopById(shopId);
  if (!shop) return null;
  const d = await rankImageData(shopId);
  return `https://doesmc.xyz/api/discord/rank-image/${shop.slug}-${await hashOf(d)}.png`;
}

/** 초대 랭킹판에 넣을 이미지 주소 */
export async function inviteRankImageUrl(shopId: string, guildId: string) {
  if (!(await rankBinding())) return null;
  const shop = getShopById(shopId);
  if (!shop) return null;
  const d = await inviteImageData(shopId, guildId);
  return `https://doesmc.xyz/api/discord/rank-image/${shop.slug}-inv-${guildId}-${await hashOf(d)}.png`;
}

export async function renderRankImage(shopId: string, inviteGuildId?: string | null) {
  const bind = await rankBinding();
  if (!bind) return null;
  const d = inviteGuildId ? await inviteImageData(shopId, inviteGuildId) : await rankImageData(shopId);
  const res = await bind.fetch("https://rank-image/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: d }) });
  return res.ok ? res : null;
}
