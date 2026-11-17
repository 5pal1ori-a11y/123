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

export type QueueImageData = {
  kind: "queue";
  title: string;
  admin: string;
  open: number;
  wait: string;
  closed: number;
  perTicket: number;
  updated: string;
  queue: { name: string; avatar: string | null; waited: string }[];
};

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

function maskShort(n: string) {
  const t = n.trim();
  if (t.length <= 1) return `${t}*`;
  if (t.length === 2) return `${t[0]}*`;
  return `${t[0]}${"*".repeat(Math.min(3, t.length - 2))}${t[t.length - 1]}`;
}
function waitedText(iso: string) {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m}분째`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}시간째` : `${Math.floor(h / 24)}일째`;
}

/** 문의 대기 현황 이미지 데이터 (대기 순서는 이름을 가린다) */
export async function queueImageData(
  shopId: string,
  guildId: string,
  q: { open: { openerId: string; createdAt: string }[]; closedToday: number; wait: string; perTicket: number },
): Promise<QueueImageData> {
  const shop = getShopById(shopId);
  const names = await resolveNames(guildId, [...new Set(q.open.slice(0, 8).map((t) => t.openerId))]);
  const admin = getShopSettings(shopId).serverStatusLast?.status ?? "offline";
  return {
    kind: "queue",
    title: `${shop?.name ?? "DOES"} 문의 대기 현황`,
    admin,
    open: q.open.length,
    wait: q.wait,
    closed: q.closedToday,
    perTicket: q.perTicket,
    updated: stamp(),
    queue: q.open.map((t, i) => ({
      name: maskShort(names[t.openerId]?.name ?? "회원"),
      avatar: i < 8 ? (names[t.openerId]?.avatar ?? null) : null,
      waited: waitedText(t.createdAt),
    })),
  };
}

export type StockImageData = {
  kind: "stock";
  title: string;
  page: number;
  pages: string[];
  inStock: number;
  soldOut: number;
  updated: string;
  groups: {
    name: string;
    soldCount: number;
    more: number;
    items: { name: string; price: number; stock: string; low: boolean; img: string | null; imgKind: "skin" | "cape" | "thumb" | null }[];
  }[];
};

const STOCK_PER_GROUP = 24;

/** 재고현황 이미지 데이터 — 구매 가능한 상품만 그림과 함께, 품절은 개수로 */
export async function stockImageData(shopId: string, page = 0): Promise<StockImageData> {
  const shop = getShopById(shopId);
  const { listProducts } = await import("@/lib/store");
  const { CAPE_BY_TYPE } = await import("@/lib/capes-data");
  // 팔린 마크 계정(MFA 묶음 제외)은 목록에서 빠진다
  const products = listProducts(shopId).filter(
    (p) => !p.stockBoardHidden && !(p.productKind === "mc_account" && !p.mcGroup && p.availableCount <= 0),
  );
  const groups = new Map<string, typeof products>();
  for (const p of products) {
    const key = p.productKind === "mc_account" ? "마인크래프트 계정" : p.productKind === "mc_cape" ? "마인크래프트 망토" : p.category?.trim() || "기타";
    const list = groups.get(key);
    if (list) list.push(p);
    else groups.set(key, [p]);
  }
  const all = [...groups.entries()].slice(0, 15);
  const idx = Math.min(Math.max(0, page), Math.max(0, all.length - 1));
  const cur = all.slice(idx, idx + 1);
  const curList = cur[0]?.[1] ?? [];
  const inStock = curList.filter((p) => p.availableCount > 0).length;
  return {
    kind: "stock",
    title: `${shop?.name ?? "DOES"} 재고현황`,
    page: idx,
    pages: all.map(([n]) => n),
    inStock,
    soldOut: curList.length - inStock,
    updated: stamp(),
    groups: cur.map(([name, list]) => {
      const avail = list.filter((p) => p.availableCount > 0);
      const shown = avail.slice(0, STOCK_PER_GROUP);
      return {
        name,
        soldCount: list.length - avail.length,
        more: avail.length - shown.length,
        items: shown.map((p) => {
          const manual = p.fulfillment === "manual";
          const capeHash = p.productKind === "mc_cape" && p.capeType ? CAPE_BY_TYPE[p.capeType]?.hash : null;
          return {
            name: p.name,
            price: p.price,
            stock: manual ? "판매중" : `재고 ${p.availableCount.toLocaleString("ko-KR")}`,
            low: !manual && p.availableCount <= 2,
            imgKind: p.productKind === "mc_account" ? "skin" : capeHash ? "cape" : p.thumbnail?.trim() ? "thumb" : null,
            img:
              p.productKind === "mc_account"
                ? `https://doesmc.xyz/api/mc-account/${p.id}?asset=skin&v=${encodeURIComponent(p.mcVersion ?? "0")}`
                : capeHash
                  ? `https://doesmc.xyz/api/capes/texture/${capeHash}`
                  : p.thumbnail?.trim() || null,
          };
        }),
      };
    }),
  };
}

/** 카테고리 한 장의 이미지 주소 + 카테고리 목록 (이미지 워커가 없으면 null) */
export async function stockImageUrl(shopId: string, page = 0) {
  if (!(await rankBinding())) return null;
  const shop = getShopById(shopId);
  if (!shop) return null;
  const d = await stockImageData(shopId, page);
  const { updated: _u, ...rest } = d;
  void _u;
  return { url: `https://doesmc.xyz/api/discord/rank-image/${shop.slug}-stock-${d.page}-${await hashOf(rest as StockImageData)}.png`, page: d.page, pages: d.pages };
}

export async function renderStockImage(shopId: string, page = 0) {
  const bind = await rankBinding();
  if (!bind) return null;
  const d = await stockImageData(shopId, page);
  const res = await bind.fetch("https://rank-image/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: d }) });
  return res.ok ? res : null;
}

export type StatusImageData = { kind: "status"; title: string; status: string; name: string; avatar: string | null; since: string; updated: string };

function kstTime(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 3_600_000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export async function statusImageData(shopId: string): Promise<StatusImageData> {
  const shop = getShopById(shopId);
  const settings = getShopSettings(shopId);
  const guildId = settings.discordGuildId || MFA_DISCORD_GUILD_ID;
  const { statusUserId } = await import("@/lib/discord/server-status");
  const userId = statusUserId(settings);
  const names = await resolveNames(guildId, [userId]);
  const last = settings.serverStatusLast ?? null;
  const status = last?.status ?? "offline";
  return {
    kind: "status",
    title: `${shop?.name ?? "DOES"} 관리자 상황`,
    status,
    name: names[userId]?.name ?? "관리자",
    avatar: names[userId]?.avatar ?? null,
    since: last ? (status === "offline" ? `마지막 접속 · ${kstTime(last.since)}` : `${kstTime(last.since)}부터 접속 중`) : "",
    updated: stamp(),
  };
}

export async function statusImageUrl(shopId: string) {
  if (!(await rankBinding())) return null;
  const shop = getShopById(shopId);
  if (!shop) return null;
  const d = await statusImageData(shopId);
  return `https://doesmc.xyz/api/discord/rank-image/${shop.slug}-status-${await hashOf(d)}.png`;
}

export async function renderStatusImage(shopId: string) {
  const bind = await rankBinding();
  if (!bind) return null;
  const d = await statusImageData(shopId);
  const res = await bind.fetch("https://rank-image/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: d }) });
  return res.ok ? res : null;
}

async function hashOf(d: RankImageData | QueueImageData | StockImageData | StatusImageData) {
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

/** 문의 대기 현황 이미지 주소 — 분 단위로 내용이 바뀌므로 해시에 시각은 넣지 않는다 */
export async function queueImageUrl(shopId: string, guildId: string, d: QueueImageData) {
  if (!(await rankBinding())) return null;
  const shop = getShopById(shopId);
  if (!shop) return null;
  const { queue, ...rest } = d;
  const key = { ...rest, queue: queue.map((x) => ({ ...x, waited: "" })), b: Math.floor(Date.now() / 600_000) };
  return `https://doesmc.xyz/api/discord/rank-image/${shop.slug}-q-${guildId}-${await hashOf(key as unknown as QueueImageData)}.png`;
}

export async function renderQueueImage(d: QueueImageData) {
  const bind = await rankBinding();
  if (!bind) return null;
  const res = await bind.fetch("https://rank-image/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: d }) });
  return res.ok ? res : null;
}

export async function renderRankImage(shopId: string, inviteGuildId?: string | null) {
  const bind = await rankBinding();
  if (!bind) return null;
  const d = inviteGuildId ? await inviteImageData(shopId, inviteGuildId) : await rankImageData(shopId);
  const res = await bind.fetch("https://rank-image/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: d }) });
  return res.ok ? res : null;
}
