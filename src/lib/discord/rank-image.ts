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
    items: { name: string; price: number; stock: string; low: boolean; sold: boolean; img: string | null; imgKind: "skin" | "cape" | "thumb" | null }[];
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
      // 구매 가능한 상품 먼저, 품절은 뒤에 흐리게
      const sorted = [...list].sort((a, b) => Number(b.availableCount > 0) - Number(a.availableCount > 0));
      const shown = sorted.slice(0, STOCK_PER_GROUP);
      return {
        name,
        soldCount: list.length - list.filter((p) => p.availableCount > 0).length,
        more: sorted.length - shown.length,
        items: shown.map((p) => {
          const manual = p.fulfillment === "manual";
          const sold = p.availableCount <= 0;
          const capeHash = p.productKind === "mc_cape" && p.capeType ? CAPE_BY_TYPE[p.capeType]?.hash : null;
          return {
            name: p.name,
            price: p.price,
            stock: sold ? "품절" : manual ? "판매중" : `재고 ${p.availableCount.toLocaleString("ko-KR")}`,
            low: !sold && !manual && p.availableCount <= 2,
            sold,
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

export type StatusImageData = { kind: "status"; title: string; status: string; name: string; avatar: string | null; since: string; updated: string; services?: { label: string; ok: boolean }[] };

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
  // 시스템 상태 (봇 · 웹 · AI 비서) — 이 이미지가 사이트에서 그려졌다는 것 자체가 웹·AI 작동을 뜻한다
  let botOnline = Boolean(settings.discordBotEnabled);
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    botOnline = botOnline && (env as Record<string, string | undefined>).STATUS_WATCH_ENABLED?.trim() === "1";
  } catch {
    /* local */
  }
  const services = [
    { label: "디스코드 봇", ok: botOnline },
    { label: "웹사이트", ok: true },
    { label: "AI 비서", ok: true },
  ];
  return {
    kind: "status",
    title: `${shop?.name ?? "DOES"} 서버 상태`,
    status,
    name: names[userId]?.name ?? "관리자",
    avatar: names[userId]?.avatar ?? null,
    since: last ? (status === "offline" ? `마지막 접속 · ${kstTime(last.since)}` : `${kstTime(last.since)}부터 접속 중`) : "",
    updated: stamp(),
    services,
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

/** 구매 로그 이미지 데이터 — 주문 번호로 상품 · 구매자 · 금액을 찾는다 */
export async function purchaseLogData(shopId: string, orderUuid: string) {
  const { getStoreForRead, getProductById } = await import("@/lib/store");
  const { CAPE_BY_TYPE } = await import("@/lib/capes-data");
  const store = getStoreForRead();
  const orders = store.orders.filter((o) => o.shopId === shopId && o.orderUuid === orderUuid);
  const first = orders[0];
  if (!first) return null;
  const product = getProductById(first.productId);
  const user = store.users.find((u) => u.id === first.userId);
  const guildId = getShopSettings(shopId).discordGuildId || MFA_DISCORD_GUILD_ID;
  const who = user?.discordId ? (await resolveNames(guildId, [user.discordId]))[user.discordId] : undefined;
  const capeHash = product?.productKind === "mc_cape" && product.capeType ? CAPE_BY_TYPE[product.capeType]?.hash : null;
  const counted = new Set(["dispensed", "paid", "awaiting_fulfillment"]);
  const totalSold = store.orders.reduce((n, o) => (o.shopId === shopId && o.productId === first.productId && counted.has(o.status) ? n + (o.quantity || 1) : n), 0);
  const t = new Date(new Date(first.createdAt).getTime() + 9 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    kind: "purchase_log" as const,
    buyer: who?.name ?? maskShort(user?.name || "회원"),
    avatar: who?.avatar ?? null,
    product: product?.name ?? "상품",
    imgKind: product?.productKind === "mc_account" ? "skin" : capeHash ? "cape" : product?.thumbnail?.trim() ? "thumb" : null,
    img:
      product?.productKind === "mc_account"
        ? `https://doesmc.xyz/api/mc-account/${product.id}?asset=skin&v=${encodeURIComponent(product.mcVersion ?? "0")}`
        : capeHash
          ? `https://doesmc.xyz/api/capes/texture/${capeHash}`
          : product?.thumbnail?.trim() || null,
    quantity: orders.reduce((n, o) => n + (o.quantity || 1), 0),
    amount: orders.reduce((n, o) => n + (o.amount || 0), 0),
    totalSold,
    time: `${t.getUTCFullYear()}.${pad(t.getUTCMonth() + 1)}.${pad(t.getUTCDate())}  ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`,
  };
}

export async function purchaseLogImageUrl(shopId: string, orderUuid: string) {
  if (!(await rankBinding())) return null;
  const shop = getShopById(shopId);
  if (!shop || !/^[A-Za-z0-9_-]{6,64}$/.test(orderUuid)) return null;
  const signed = await signedDataImageUrl(shop.slug, await purchaseLogData(shopId, orderUuid).catch(() => null));
  return signed ?? `https://doesmc.xyz/api/discord/rank-image/${shop.slug}-order-${orderUuid}.png`;
}

/** 구매 영수증(DM) 이미지 주소 */
export async function receiptImageUrl(shopId: string, orderUuid: string) {
  const shop = getShopById(shopId);
  if (!shop || !/^[A-Za-z0-9_-]{6,64}$/.test(orderUuid)) return null;
  const signed = (await rankBinding()) ? await signedDataImageUrl(shop.slug, await receiptData(shopId, orderUuid).catch(() => null)) : null;
  return signed ?? `https://doesmc.xyz/api/discord/rank-image/${shop.slug}-receipt-${orderUuid}.png`;
}

export async function renderPurchaseLogImage(shopId: string, orderUuid: string) {
  const bind = await rankBinding();
  if (!bind) return null;
  const d = await purchaseLogData(shopId, orderUuid);
  if (!d) return null;
  const res = await bind.fetch("https://rank-image/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: d }) });
  return res.ok ? res : null;
}

const METHOD_LABEL: Record<string, string> = { bank: "계좌이체", culture_gift: "문화상품권", coin: "코인" };

/** 충전 완료 로그 이미지 데이터 — 입금자명은 가운데를 가린다 */
export async function chargeLogData(shopId: string, chargeId: string, balance: number) {
  const { getPointCharge, getStoreForRead } = await import("@/lib/store");
  const charge = getPointCharge(chargeId, shopId);
  if (!charge) return null;
  const user = getStoreForRead().users.find((u) => u.id === charge.userId);
  const guildId = getShopSettings(shopId).discordGuildId || MFA_DISCORD_GUILD_ID;
  const who = user?.discordId ? (await resolveNames(guildId, [user.discordId]))[user.discordId] : undefined;
  const t = new Date(new Date(charge.completedAt || charge.createdAt).getTime() + 9 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dep = (charge.depositorName ?? "").trim();
  return {
    kind: "charge_log" as const,
    user: who?.name ?? maskShort(user?.name || "회원"),
    avatar: who?.avatar ?? null,
    amount: charge.amount,
    method: METHOD_LABEL[charge.method] ?? "",
    depositor: dep && charge.method === "bank" ? maskShort(dep) : "",
    balance,
    time: `${t.getUTCFullYear()}.${pad(t.getUTCMonth() + 1)}.${pad(t.getUTCDate())}  ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`,
  };
}

export async function chargeLogImageUrl(shopId: string, chargeId: string, balance: number) {
  if (!(await rankBinding())) return null;
  const shop = getShopById(shopId);
  if (!shop || !/^[A-Za-z0-9_-]{4,64}$/.test(chargeId)) return null;
  const signed = await signedDataImageUrl(shop.slug, await chargeLogData(shopId, chargeId, balance).catch(() => null));
  return signed ?? `https://doesmc.xyz/api/discord/rank-image/${shop.slug}-charge-${chargeId}.png?b=${Math.max(0, Math.round(balance))}`;
}

export async function renderChargeLogImage(shopId: string, chargeId: string, balance: number) {
  const bind = await rankBinding();
  if (!bind) return null;
  const d = await chargeLogData(shopId, chargeId, balance);
  if (!d) return null;
  const res = await bind.fetch("https://rank-image/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: d }) });
  return res.ok ? res : null;
}

/** 입장 환영 이미지 데이터 */
export async function welcomeData(shopId: string, guildId: string, userId: string, memberCount: number, avatarHash: string) {
  const shop = getShopById(shopId);
  const who = (await resolveNames(guildId, [userId]))[userId];
  let created = "";
  try {
    const t = new Date(Number((BigInt(userId) >> BigInt(22)) + BigInt(1420070400000)) + 9 * 3_600_000);
    created = `${t.getUTCFullYear()}.${String(t.getUTCMonth() + 1).padStart(2, "0")}.${String(t.getUTCDate()).padStart(2, "0")}`;
  } catch {
    /* ignore */
  }
  const avatar =
    avatarHash && avatarHash !== "0" && /^(a_)?[0-9a-f]{32}$/.test(avatarHash)
      ? `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=256`
      : (who?.avatar ?? null);
  return { kind: "welcome" as const, shop: shop?.name ?? "DOES", name: who?.name ?? "새 멤버", avatar, memberCount, created };
}

export async function renderWelcomeImage(shopId: string, guildId: string, userId: string, memberCount: number, avatarHash: string) {
  const bind = await rankBinding();
  if (!bind) return null;
  const d = await welcomeData(shopId, guildId, userId, memberCount, avatarHash);
  const res = await bind.fetch("https://rank-image/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: d }) });
  return res.ok ? res : null;
}

/** 후기 로그 이미지 데이터 */
export async function reviewData(shopId: string, reviewId: string) {
  const { getStoreForRead } = await import("@/lib/store");
  const { CAPE_BY_TYPE } = await import("@/lib/capes-data");
  const store = getStoreForRead();
  const review = store.reviews.find((r) => r.id === reviewId && r.shopId === shopId);
  if (!review) return null;
  const user = store.users.find((u) => u.id === review.userId);
  const product = review.productId ? store.products.find((p) => p.id === review.productId) : null;
  const guildId = getShopSettings(shopId).discordGuildId || MFA_DISCORD_GUILD_ID;
  const who = user?.discordId ? (await resolveNames(guildId, [user.discordId]))[user.discordId] : undefined;
  const capeHash = product?.productKind === "mc_cape" && product.capeType ? CAPE_BY_TYPE[product.capeType]?.hash : null;
  const t = new Date(new Date(review.createdAt).getTime() + 9 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    kind: "review" as const,
    author: who?.name ?? maskShort(user?.name || "회원"),
    avatar: who?.avatar ?? null,
    product: product?.name ?? "상품",
    imgKind: product?.productKind === "mc_account" ? "skin" : capeHash ? "cape" : product?.thumbnail?.trim() ? "thumb" : null,
    img:
      product?.productKind === "mc_account"
        ? `https://doesmc.xyz/api/mc-account/${product.id}?asset=skin&v=${encodeURIComponent(product.mcVersion ?? "0")}`
        : capeHash
          ? `https://doesmc.xyz/api/capes/texture/${capeHash}`
          : product?.thumbnail?.trim() || null,
    rating: Math.max(0, Math.min(5, Math.round(review.rating || 0))),
    body: review.body,
    time: `${t.getUTCFullYear()}.${pad(t.getUTCMonth() + 1)}.${pad(t.getUTCDate())}  ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`,
  };
}

export async function renderReviewImage(shopId: string, reviewId: string) {
  const bind = await rankBinding();
  if (!bind) return null;
  const d = await reviewData(shopId, reviewId);
  if (!d) return null;
  const res = await bind.fetch("https://rank-image/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: d }) });
  return res.ok ? res : null;
}

/** 후기 로그 이미지 주소 */
export async function reviewImageUrl(shopId: string, reviewId: string) {
  const shop = getShopById(shopId);
  if (!shop) return null;
  const signed = await signedDataImageUrl(shop.slug, await reviewData(shopId, reviewId).catch(() => null));
  return signed ?? `https://doesmc.xyz/api/discord/rank-image/${shop.slug}-review-${reviewId}.png`;
}

async function productImg(productId: string | null | undefined) {
  const { getProductById } = await import("@/lib/store");
  const { CAPE_BY_TYPE } = await import("@/lib/capes-data");
  const product = productId ? getProductById(productId) : null;
  const capeHash = product?.productKind === "mc_cape" && product.capeType ? CAPE_BY_TYPE[product.capeType]?.hash : null;
  return {
    product,
    imgKind: product?.productKind === "mc_account" ? "skin" : capeHash ? "cape" : product?.thumbnail?.trim() ? "thumb" : null,
    img:
      product?.productKind === "mc_account"
        ? `https://doesmc.xyz/api/mc-account/${product.id}?asset=skin&v=${encodeURIComponent(product.mcVersion ?? "0")}`
        : capeHash
          ? `https://doesmc.xyz/api/capes/texture/${capeHash}`
          : product?.thumbnail?.trim() || null,
  };
}

/** 커뮤니티 봇 이미지 (서명은 /api/discord/botimg 에서 확인) */
export function renderBotImage(d: unknown) {
  return postRender(d);
}

async function postRender(d: unknown) {
  const bind = await rankBinding();
  if (!bind) return null;
  const res = await bind.fetch("https://rank-image/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: d }) });
  return res.ok ? res : null;
}

/** 재입고 알림 이미지 */
export async function renderRestockImage(productId: string, added: number, total: number) {
  const { product, img, imgKind } = await productImg(productId);
  if (!product) return null;
  return postRender({ kind: "restock", product: product.name, price: product.price, img, imgKind, added, total, time: stamp().replace(" 갱신", "") });
}

/** 구매 영수증 (DM) 이미지 */
export async function renderReceiptImage(shopId: string, orderUuid: string) {
  const d = await receiptData(shopId, orderUuid);
  return d ? postRender(d) : null;
}

async function receiptData(shopId: string, orderUuid: string) {
  const d = await purchaseLogData(shopId, orderUuid);
  if (!d) return null;
  return {
    kind: "receipt",
    product: d.product,
    img: d.img,
    imgKind: d.imgKind,
    order: orderUuid,
    buyer: d.buyer,
    quantity: d.quantity,
    amount: d.amount,
    time: d.time,
    note: "상품 정보(16자리 코드)는 아래 메시지에서 확인하세요 · doesmc.xyz/check",
  };
}

/** /내정보 카드 데이터 (해시가 맞을 때만 그린다 → 남의 정보를 주소로 볼 수 없음) */
export async function profileData(shopId: string, discordId: string) {
  const { getStoreForRead, userPremiumPlan } = await import("@/lib/store");
  const store = getStoreForRead();
  const user = store.users.find((u) => u.shopId === shopId && u.discordId === discordId);
  const guildId = getShopSettings(shopId).discordGuildId || MFA_DISCORD_GUILD_ID;
  const who = (await resolveNames(guildId, [discordId]))[discordId];
  const counted = new Set(["dispensed", "paid", "awaiting_fulfillment"]);
  const mine = user ? store.orders.filter((o) => o.shopId === shopId && o.userId === user.id && counted.has(o.status)) : [];
  const { top } = purchaseRanking(shopId);
  const idx = user ? top.findIndex((r) => r.key === user.id) : -1;
  const tier = user?.tierId ? store.tiers.find((t) => t.id === user.tierId)?.name : null;
  const j = user ? new Date(new Date(user.createdAt).getTime() + 9 * 3_600_000) : null;
  return {
    kind: "profile" as const,
    linked: Boolean(user),
    name: who?.name ?? user?.name ?? "회원",
    avatar: who?.avatar ?? null,
    plan: user ? userPremiumPlan(user) : null,
    tier: tier ?? null,
    joined: j ? `${j.getUTCFullYear()}.${String(j.getUTCMonth() + 1).padStart(2, "0")}.${String(j.getUTCDate()).padStart(2, "0")}` : "",
    rank: idx >= 0 ? idx + 1 : null,
    spent: mine.reduce((n, o) => n + o.amount, 0),
    orders: mine.length,
    points: user?.points ?? 0,
    reviews: user ? store.reviews.filter((r) => r.shopId === shopId && r.userId === user.id).length : 0,
  };
}

export async function profileImageUrl(shopId: string, discordId: string) {
  if (!(await rankBinding())) return null;
  const shop = getShopById(shopId);
  if (!shop) return null;
  const d = await profileData(shopId, discordId);
  return { url: `https://doesmc.xyz/api/discord/rank-image/${shop.slug}-profile-${discordId}-${await hashOf(d as unknown as StatusImageData)}.png`, linked: d.linked };
}

export async function renderProfileImage(shopId: string, discordId: string, hash: string) {
  const d = await profileData(shopId, discordId);
  if ((await hashOf(d as unknown as StatusImageData)) !== hash) return null;
  return postRender(d);
}

/* ───────── 공용 발표 카드 (서명된 주소) ───────── */
export type CardPayload = {
  theme: "party" | "gold" | "green" | "blue" | "pink" | "red";
  eyebrow: string;
  title: string;
  people?: { id: string; label?: string }[];
  subtitle?: string;
  chips?: string[];
  note?: string;
};

function b64url(str: string) {
  return Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(str: string) {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
async function cardSig(slug: string, body: string) {
  const { expectedSecret } = await import("@/lib/internal-secret");
  const secret = (await expectedSecret()) || "does-card";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`card:${slug}:${body}`));
  return [...new Uint8Array(mac)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 데이터를 주소에 담은 이미지 (구매·충전·후기 로그, 영수증).
 * 로그를 보내는 순간 디스코드가 이미지를 가져가는데, 다른 지역 서버에서는 KV에 방금 저장한 주문·충전이
 * 최대 1분 가까이 안 보여 502 → 디스코드가 깨진 이미지로 캐시한다. 그래서 그릴 데이터를 보낼 때 미리 만들어
 * 서명과 함께 주소에 넣고, 그리는 쪽은 저장소를 다시 읽지 않는다.
 */
const SIGNED_KINDS = new Set(["purchase_log", "charge_log", "review", "receipt", "shop_stats", "proxy_panel", "proxy_status", "mine_panel", "mine_result", "pickaxe_card"]);
const SIGNED_MAX_BODY = 1900;

export async function signedDataImageUrl(shopSlug: string, data: ({ kind: string } & Record<string, unknown>) | null) {
  if (!data || !SIGNED_KINDS.has(data.kind)) return null;
  const body = b64url(JSON.stringify(data));
  if (body.length > SIGNED_MAX_BODY) return null;
  return `https://doesmc.xyz/api/discord/rank-image/${shopSlug}-sd-${body}-${await cardSig(shopSlug, `sd:${body}`)}.png`;
}

/** 상점 통계 띠 이미지 (링크 미리보기 맨 아래) — 숫자가 바뀌면 주소도 바뀌어 디스코드 캐시가 갱신된다 */
export async function shopStatsImageUrl(shopSlug: string, s: { sold: number; buyers: number; reviews: number; avg: number; since?: string }) {
  if (!(await rankBinding())) return null;
  return signedDataImageUrl(shopSlug, { kind: "shop_stats", sold: s.sold, buyers: s.buyers, reviews: s.reviews, avg: Math.round(s.avg * 10) / 10, ...(s.since ? { since: s.since } : {}) });
}

export async function renderSignedDataImage(shopSlug: string, body: string, sig: string) {
  if (body.length > SIGNED_MAX_BODY || (await cardSig(shopSlug, `sd:${body}`)) !== sig) return null;
  let d: { kind?: string };
  try {
    d = JSON.parse(fromB64url(body)) as { kind?: string };
  } catch {
    return null;
  }
  if (!d || typeof d.kind !== "string" || !SIGNED_KINDS.has(d.kind)) return null;
  return postRender(d);
}

/** 발표 카드 이미지 주소 — 내용은 주소에 담고, 서명이 맞아야 그린다 (남이 문구를 바꿔 만들 수 없음) */
export async function cardImageUrl(shopSlug: string, p: CardPayload) {
  if (!(await rankBinding())) return null;
  const clean: CardPayload = {
    theme: p.theme,
    eyebrow: p.eyebrow.slice(0, 40),
    title: p.title.slice(0, 40),
    ...(p.people?.length ? { people: p.people.slice(0, 6).map((x) => ({ id: x.id, ...(x.label ? { label: x.label.slice(0, 20) } : {}) })) } : {}),
    ...(p.subtitle ? { subtitle: p.subtitle.slice(0, 60) } : {}),
    ...(p.chips?.length ? { chips: p.chips.slice(0, 4).map((c) => c.slice(0, 30)) } : {}),
    ...(p.note ? { note: p.note.slice(0, 80) } : {}),
  };
  const body = b64url(JSON.stringify(clean));
  return `https://doesmc.xyz/api/discord/rank-image/${shopSlug}-card-${body}-${await cardSig(shopSlug, body)}.png`;
}

export async function renderCardImage(shopSlug: string, body: string, sig: string) {
  if ((await cardSig(shopSlug, body)) !== sig) return null;
  const { getShopBySlug } = await import("@/lib/store");
  const shop = getShopBySlug(shopSlug);
  if (!shop) return null;
  let p: CardPayload;
  try {
    p = JSON.parse(fromB64url(body)) as CardPayload;
  } catch {
    return null;
  }
  const guildId = getShopSettings(shop.id).discordGuildId || MFA_DISCORD_GUILD_ID;
  const ids = (p.people ?? []).map((x) => x.id).filter((x) => /^\d{15,25}$/.test(x));
  const names = ids.length ? await resolveNames(guildId, ids) : {};
  return postRender({
    kind: "card",
    theme: p.theme,
    eyebrow: p.eyebrow,
    title: p.title,
    people: (p.people ?? []).map((x) => ({ name: names[x.id]?.name ?? "회원", avatar: names[x.id]?.avatar ?? null, label: x.label })),
    subtitle: p.subtitle,
    chips: p.chips,
    note: p.note,
  });
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

export async function hasRankImage() {
  return Boolean(await rankBinding());
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
