/**
 * /계정등록 — 마크 계정 판매 글. 카테고리 아래에 `접두사-닉네임` 채널을 만들고,
 * 스킨·망토·하이픽셀 스탯을 보여 주는 패널을 올린다. 패널의 셀렉트로 게임별 스탯을 골라 볼 수 있다.
 */
import { randomBytes } from "crypto";
import {
  actionRow,
  button,
  ButtonStyle,
  cid,
  container,
  MessageFlags,
  mediaGallery,
  separator,
  stringSelect,
  textDisplay,
} from "@/lib/discord/components";
import { discordRest, postChannelMessage } from "@/lib/discord/rest";
import { shopUrl } from "@/lib/domain";
import { maskMcNickname } from "@/lib/mc-account";
import { resolveMcProfile } from "@/lib/mc-profile-server";
import { getShopById, getShopSettings, updateShopSettings, persistAsync } from "@/lib/store";
import { hypixelKey } from "@/lib/world/minecraft";
import { kvGetJson, kvPutJson } from "@/lib/world/kv";

function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://vendix.team").replace(/\/$/, "");
}

export type ListingTab = "bedwars" | "skywars" | "duels";
export const LISTING_TABS: { id: ListingTab; label: string }[] = [
  { id: "bedwars", label: "BEDWARS" },
  { id: "skywars", label: "SKYWARS" },
  { id: "duels", label: "DUELS" },
];

export type Listing = {
  id: string;
  uuid: string;
  name: string;
  price: number;
  prefix: string;
  capes: string[];
};

type Hy = {
  rank: string | null;
  level: number;
  firstLogin: number | null;
  lastLogin: number | null;
  bedwars: Record<string, number>;
  skywars: Record<string, number | string>;
  duels: Record<string, number>;
} | null;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) / 100 : a);
const f = (n: number | string) => (typeof n === "number" ? n.toLocaleString("ko-KR") : n);

const RANKS: Record<string, string> = {
  VIP: "VIP", VIP_PLUS: "VIP+", MVP: "MVP", MVP_PLUS: "MVP+", SUPERSTAR: "MVP++",
  ADMIN: "ADMIN", MODERATOR: "MOD", HELPER: "HELPER", YOUTUBER: "YOUTUBE",
};

/** 하이픽셀 상세 스탯 (30분 캐시). 키가 없거나 기록이 없으면 null */
export async function fetchHypixelDetail(uuid: string): Promise<Hy> {
  const key = await hypixelKey();
  if (!key) return null;
  const cacheKey = `acct:hy:${uuid}`;
  const cached = await kvGetJson<Hy | { none: true }>(cacheKey);
  if (cached) return "none" in (cached as object) ? null : (cached as Hy);
  const res = await fetch(`https://api.hypixel.net/v2/player?uuid=${uuid}`, {
    headers: { "API-Key": key },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json().catch(() => null)) as { player?: Record<string, unknown> | null } | null;
  const p = data?.player;
  if (!p) {
    await kvPutJson(cacheKey, { none: true }, 1800);
    return null;
  }
  const st = (p.stats ?? {}) as Record<string, Record<string, unknown>>;
  const bw = st.Bedwars ?? {};
  const sw = st.SkyWars ?? {};
  const du = st.Duels ?? {};
  const ach = (p.achievements ?? {}) as Record<string, unknown>;
  const rankKey =
    typeof p.rank === "string" && p.rank !== "NORMAL"
      ? p.rank
      : p.monthlyPackageRank === "SUPERSTAR"
        ? "SUPERSTAR"
        : typeof p.newPackageRank === "string" && p.newPackageRank !== "NONE"
          ? p.newPackageRank
          : null;
  const exp = num(p.networkExp);
  const out: NonNullable<Hy> = {
    rank: rankKey ? (RANKS[rankKey] ?? rankKey) : null,
    level: Math.max(1, Math.floor((Math.sqrt(2 * exp + 30625) / 50 - 2.5) * 100) / 100),
    firstLogin: typeof p.firstLogin === "number" ? p.firstLogin : null,
    lastLogin: typeof p.lastLogin === "number" ? p.lastLogin : null,
    bedwars: {
      stars: num(ach.bedwars_level),
      wins: num(bw.wins_bedwars), losses: num(bw.losses_bedwars),
      finalKills: num(bw.final_kills_bedwars), finalDeaths: num(bw.final_deaths_bedwars),
      kills: num(bw.kills_bedwars), deaths: num(bw.deaths_bedwars),
      bedsBroken: num(bw.beds_broken_bedwars), bedsLost: num(bw.beds_lost_bedwars),
    },
    skywars: {
      level: typeof sw.levelFormatted === "string" ? sw.levelFormatted.replace(/§./g, "") : "-",
      wins: num(sw.wins), losses: num(sw.losses), kills: num(sw.kills), deaths: num(sw.deaths),
      assists: num(sw.assists), coins: num(sw.coins), souls: num(sw.souls),
    },
    duels: {
      wins: num(du.wins), losses: num(du.losses), kills: num(du.kills), deaths: num(du.deaths),
      bestStreak: num(du.best_overall_winstreak),
    },
  };
  await kvPutJson(cacheKey, out, 1800);
  return out;
}

function grid(cells: [string, string | number][]) {
  const lines: string[] = [];
  for (let i = 0; i < cells.length; i += 3) {
    lines.push(
      cells
        .slice(i, i + 3)
        .map(([k, v]) => `${k} **${f(v)}**`)
        .join("  ·  "),
    );
  }
  return lines.join("\n");
}

function statsText(tab: ListingTab, hy: Hy) {
  if (!hy) return "하이픽셀 기록이 없거나 불러오지 못했어요";
  if (tab === "bedwars") {
    const b = hy.bedwars as Record<string, number>;
    return grid([
      ["별", `${b.stars}✫`], ["승", b.wins!], ["패", b.losses!],
      ["WLR", ratio(b.wins!, b.losses!)], ["파이널 킬", b.finalKills!], ["파이널 데스", b.finalDeaths!],
      ["FKDR", ratio(b.finalKills!, b.finalDeaths!)], ["킬", b.kills!], ["데스", b.deaths!],
      ["KDR", ratio(b.kills!, b.deaths!)], ["침대 파괴", b.bedsBroken!], ["침대 잃음", b.bedsLost!],
      ["BBLR", ratio(b.bedsBroken!, b.bedsLost!)],
    ]);
  }
  if (tab === "skywars") {
    const s = hy.skywars as Record<string, number | string>;
    return grid([
      ["레벨", s.level!], ["승", s.wins!], ["패", s.losses!],
      ["WLR", ratio(Number(s.wins), Number(s.losses))], ["킬", s.kills!], ["데스", s.deaths!],
      ["KDR", ratio(Number(s.kills), Number(s.deaths))], ["어시스트", s.assists!], ["코인", s.coins!],
    ]);
  }
  const d = hy.duels as Record<string, number>;
  return grid([
    ["승", d.wins!], ["패", d.losses!], ["WLR", ratio(d.wins!, d.losses!)],
    ["킬", d.kills!], ["데스", d.deaths!], ["KDR", ratio(d.kills!, d.deaths!)],
    ["최고 연승", d.bestStreak!],
  ]);
}

export function listingPanel(slug: string, l: Listing, hy: Hy, tab: ListingTab) {
  const masked = maskMcNickname(l.name);
  const rank = hy?.rank ? `[${hy.rank}] ` : "";
  const header = `## [${l.prefix}] ${masked}`;
  const kids: unknown[] = [
    mediaGallery([`${appOrigin()}/api/discord/skin/${l.uuid}.png`]),
    textDisplay(
      [
        header,
        `**${l.price.toLocaleString("ko-KR")}원**`,
        l.capes.length ? `망토 ${l.capes.join(" · ")}` : "망토 없음",
      ].join("\n"),
    ),
    separator(true, 1),
    textDisplay(
      [
        hy ? `-# 하이픽셀 ${rank}Lv.${Math.floor(hy.level)}` : "-# 하이픽셀",
        `### ${LISTING_TABS.find((t) => t.id === tab)?.label}`,
        statsText(tab, hy),
      ].join("\n"),
    ),
    actionRow(
      stringSelect({
        customId: cid(slug, "acct_tab", l.id),
        placeholder: "게임을 골라 스탯 보기",
        options: LISTING_TABS.map((t) => ({ label: t.label, value: t.id, description: t.id === tab ? "보는 중" : undefined })),
      }),
    ),
    actionRow(button({ label: "웹에서 구매하기", url: shopUrl(slug, "/dashboard?tab=products"), style: ButtonStyle.LINK })),
  ];
  return { flags: MessageFlags.IS_COMPONENTS_V2, components: [container(kids)], allowed_mentions: { parse: [] as string[] } };
}

export async function loadListing(id: string) {
  return kvGetJson<Listing>(`acct:listing:${id}`);
}

/** 채널을 만들고 패널을 올린다. 성공하면 채널 ID */
export async function createListing(input: {
  shopId: string;
  guildId: string;
  nickname: string;
  price: number;
  prefix?: string;
  categoryId?: string;
}): Promise<{ ok: true; channelId: string } | { ok: false; error: string }> {
  const shop = getShopById(input.shopId);
  if (!shop) return { ok: false, error: "상점을 찾을 수 없어요." };
  const settings = getShopSettings(input.shopId);
  const categoryId = input.categoryId || settings.accountCategoryId || "";
  const prefix = (input.prefix || settings.accountPrefix || "NON").trim().slice(0, 12).toUpperCase();
  if (!categoryId) return { ok: false, error: "카테고리를 정해 주세요. (`카테고리` 옵션에서 고르면 다음부터 기억해요)" };

  const profile = await resolveMcProfile(input.nickname);
  if (!profile?.uuid) return { ok: false, error: `마인크래프트 계정 \`${input.nickname}\` 을(를) 찾지 못했어요.` };

  const hy = await fetchHypixelDetail(profile.uuid);
  const listing: Listing = {
    id: randomBytes(4).toString("hex"),
    uuid: profile.uuid,
    name: profile.name,
    price: input.price,
    prefix,
    capes: profile.capes.map((c) => c.title ?? "").filter(Boolean),
  };

  // 채널 이름에는 닉네임 일부를 가려서 넣는다 (예: non-jaxxxxx4)
  const masked = maskMcNickname(profile.name).replace(/\*/g, "x").toLowerCase();
  const channelName = `${prefix}-${masked}`.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 90);
  const created = await discordRest(
    "POST",
    `/guilds/${input.guildId}/channels`,
    { name: channelName, type: 0, parent_id: categoryId },
    input.shopId,
  );
  const channelId = (created.json as { id?: string } | null)?.id;
  if (!created.ok || !channelId) {
    return { ok: false, error: "채널을 만들지 못했어요. 봇에게 **채널 관리** 권한이 있는지, 카테고리가 맞는지 확인해 주세요." };
  }

  await kvPutJson(`acct:listing:${listing.id}`, listing);
  const posted = await postChannelMessage(channelId, listingPanel(shop.slug, listing, hy, "bedwars"), input.shopId);
  if (!posted.ok) return { ok: false, error: "채널은 만들었지만 패널을 올리지 못했어요." };

  // 다음부터는 같은 카테고리·접두사를 기본값으로
  updateShopSettings(input.shopId, { accountCategoryId: categoryId, accountPrefix: prefix });
  await persistAsync();
  return { ok: true, channelId };
}
